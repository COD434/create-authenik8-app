import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

import { createModelsGateway, createOpenRouterProvider, type ModelsGateway } from "@authenik8/models";

/**
 * Studio Web (M5 v0): a localhost ChatGPT-style builder chat streaming over
 * the Authenik8 models gateway (BYOK, free OpenRouter models).
 *
 * Trust boundary:
 * - binds 127.0.0.1 only; no CORS (same-origin UI);
 * - the OpenRouter key arrives per request in the X-OpenRouter-Key header
 *   and is never stored, logged, or echoed;
 * - no request logging, no telemetry.
 */

const PORT = Number(process.env.PORT ?? 4870);
const MAX_BODY_BYTES = 1024 * 1024;

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
};

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(32_000),
});

const chatBodySchema = z.object({
  model: z.string().min(1).max(120),
  messages: z.array(chatMessageSchema).min(1).max(40),
});

export type WebStudioDeps = {
  /** Build a gateway for one request's key; the server stores nothing. */
  gatewayFor(apiKey: string): Pick<ModelsGateway, "listModels" | "chatStream">;
};

const SYSTEM_PROMPT = [
  "You are Authenik8 Studio Web, a senior product engineer for the Authenik8 ecosystem.",
  "Thesis: vibe-code the interface; keep identity on a backend the user owns.",
  "When the user describes an app, produce concrete, secure, runnable work:",
  "Authenik8-generated projects use Express + TypeScript, rotating JWTs with stateful",
  "Redis-backed sessions, Prisma, strict cookies, CSRF, and server-side authorization.",
  "Never suggest client-held secrets, tokens in browser storage, frontend route guards",
  "as authorization, or disabling CSRF/origin checks. Prefer free-tier OpenRouter models",
  "and plain, reviewable code. Be concise and build in small, verifiable steps.",
].join(" ");

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    let text = "";
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      text += chunk.toString("utf8");
    });
    req.on("end", () => resolve(text));
    req.on("error", () => resolve(null));
  });
}

function apiKeyFrom(req: IncomingMessage): string | null {
  const header = req.headers["x-openrouter-key"];
  const value = Array.isArray(header) ? header[0] : header;
  const key = value?.trim() ?? "";
  return key.length > 0 ? key : null;
}

export function createWebStudioServer(deps: WebStudioDeps): Server {
  return createServer((req, res) => {
    void handle(deps, req, res);
  });
}

async function handle(deps: WebStudioDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  try {
    if (req.method === "GET" && url.pathname in STATIC_FILES) {
      const entry = STATIC_FILES[url.pathname]!;
      const content = await readFile(path.join(PUBLIC_DIR, entry.file), "utf8");
      res.writeHead(200, { "content-type": entry.type });
      res.end(content);
      return;
    }

    if (url.pathname === "/api/models" && req.method === "GET") {
      const key = apiKeyFrom(req);
      if (key === null) {
        sendJson(res, 401, { error: "Missing X-OpenRouter-Key header" });
        return;
      }
      const models = await deps.gatewayFor(key).listModels();
      sendJson(res, 200, {
        models: models
          .filter((model) => model.isFree && model.supportsTools)
          .map((model) => ({ id: model.id, name: model.name, contextLength: model.contextLength })),
      });
      return;
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const key = apiKeyFrom(req);
      if (key === null) {
        sendJson(res, 401, { error: "Missing X-OpenRouter-Key header" });
        return;
      }
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: "Request body too large" });
        return;
      }
      const parsed = chatBodySchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
        return;
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });

      const abort = new AbortController();
      req.on("close", () => abort.abort());

      try {
        const gateway = deps.gatewayFor(key);
        for await (const chunk of gateway.chatStream({
          model: parsed.data.model,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...parsed.data.messages],
          signal: abort.signal,
        })) {
          if (chunk.delta !== null) {
            res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
          }
          if (chunk.usage) {
            res.write(`data: ${JSON.stringify({ usage: chunk.usage })}\n\n`);
          }
          if (chunk.finishReason !== null) {
            res.write(`data: ${JSON.stringify({ done: true, finishReason: chunk.finishReason })}\n\n`);
          }
        }
      } catch (error) {
        // ModelsError messages are key-safe by contract in the models package.
        const message = error instanceof Error ? error.message : "stream failed";
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      } finally {
        res.end();
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    } else {
      res.end();
    }
    void error; // never logged: may contain request context
  }
}

export function main(): void {
  const gatewayFor = (apiKey: string) =>
    createModelsGateway({
      provider: createOpenRouterProvider({
        apiKey,
        appTitle: "Authenik8 Web Studio",
        httpReferer: "https://authenik8.local",
      }),
    });

  const server = createWebStudioServer({ gatewayFor });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Authenik8 Studio Web: http://127.0.0.1:${PORT} (BYOK: your key stays in this tab)`);
  });
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
