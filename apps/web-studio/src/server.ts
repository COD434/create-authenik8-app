import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

import {
  assembleToolCalls,
  createModelsGateway,
  createOpenRouterProvider,
  type ChatMessage,
  type ModelsGateway,
  type ToolCallDelta,
} from "@authenik8/models";

import { executeTool, resolveInsideSandbox, toolDefinitions } from "./tools.js";

/**
 * Studio Web (M5 v1): a localhost ChatGPT-style builder chat with a sandboxed
 * tool loop — the model can list, read, and write real files, streamed over
 * the Authenik8 models gateway (BYOK, free OpenRouter models).
 *
 * Trust boundary:
 * - binds 127.0.0.1 only; no CORS (same-origin UI);
 * - the OpenRouter key arrives per request in the X-OpenRouter-Key header
 *   and is never stored, logged, or echoed;
 * - tool execution is confined to the sandbox root (path-guarded);
 * - conversation history lives in server memory only; reset wipes it;
 * - no request logging, no telemetry.
 */

const PORT = Number(process.env.PORT ?? 4870);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TOOL_ROUNDS = 6;

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
};

const chatBodySchema = z.object({
  model: z.string().min(1).max(120),
  message: z.string().min(1).max(32_000),
});

/** Preview content types: strict allow-list, default octet-stream. */
const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export type WebStudioDeps = {
  /** Build a gateway for one request's key; the server stores nothing. */
  gatewayFor(apiKey: string): Pick<ModelsGateway, "listModels" | "chatStream">;
  /** Sandbox root for tool execution; created on demand. */
  sandboxRoot: string;
};

const SYSTEM_PROMPT = [
  "You are Authenik8 Studio Web, a senior product engineer for the Authenik8 ecosystem.",
  "Thesis: vibe-code the interface; keep identity on a backend the user owns.",
  "You have tools that operate on a sandbox project directory: list_files, read_file,",
  "write_file, and design_audit (Authenik8 design checks A8-DS-001..004 over a design",
  "directory with tokens.json + DESIGN.md). Build real files in small, verifiable steps:",
  "list the project, write complete runnable files, and say what you did in one short",
  "line before each tool call. After writing or changing design tokens, run design_audit",
  "and fix every failed check before moving on.",
  "The user previews your work live: the sandbox's index.html is served at /preview/.",
  "For web output, create index.html at the project root and keep asset paths relative.",
  "Authenik8-generated projects use Express + TypeScript, rotating JWTs with stateful",
  "Redis-backed sessions, Prisma, strict cookies, CSRF, and server-side authorization.",
  "Never suggest client-held secrets, tokens in browser storage, frontend route guards",
  "as authorization, or disabling CSRF/origin checks. Prefer free-tier OpenRouter models",
  "and plain, reviewable code.",
].join(" ");

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sseEvent(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function previewNotFound(res: ServerResponse): void {
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(
    "<!doctype html><meta charset='utf-8'><body style=\"font-family:system-ui;background:#0b0e14;"
    + "color:#8b94a7;display:grid;place-items:center;height:100vh;margin:0\">"
    + "<p>Nothing here yet — ask the assistant to build it.</p></body>",
  );
}

/**
 * Read-only static serving of the sandbox at /preview/.
 *
 * Path discipline: segments are checked BEFORE resolution (no traversal, no
 * dotfiles — .env and .git are never served), then re-verified through the
 * same sandbox guard as the write tools. This is the studio's window on what
 * the model built; the studio UI embeds it in a sandboxed iframe (opaque
 * origin), so model-written scripts cannot reach the chat or the key.
 */
function servePreview(sandboxRoot: string, url: URL, res: ServerResponse): void {
  let requested = "";
  if (url.pathname !== "/preview" && url.pathname !== "/preview/") {
    try {
      requested = decodeURIComponent(url.pathname.slice("/preview/".length));
    } catch {
      previewNotFound(res);
      return;
    }
  }

  let target: string;
  if (requested === "") {
    target = path.join(sandboxRoot, "index.html");
  } else {
    const segments = requested.split("/");
    if (segments.some((segment) => segment === "" || segment.startsWith("."))) {
      previewNotFound(res);
      return;
    }
    const resolved = resolveInsideSandbox(sandboxRoot, requested);
    if (resolved === null) {
      previewNotFound(res);
      return;
    }
    target = resolved;
  }

  void stat(target)
    .then((info) => {
      if (info.isDirectory()) target = path.join(target, "index.html");
      return readFile(target);
    })
    .then((content) => {
      const type = PREVIEW_CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff", "cache-control": "no-store" });
      res.end(content);
    })
    .catch(() => previewNotFound(res));
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
  // Single-user localhost tool: one conversation in memory; /api/reset wipes it.
  const conversation: ChatMessage[] = [];

  return createServer((req, res) => {
    void handle(deps, conversation, req, res);
  });
}

async function handle(
  deps: WebStudioDeps,
  conversation: ChatMessage[],
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
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

    if (url.pathname === "/api/reset" && req.method === "POST") {
      conversation.length = 0;
      sendJson(res, 200, { ok: true });
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

      conversation.push({ role: "user", content: parsed.data.message });

      try {
        const gateway = deps.gatewayFor(key);
        let rounds = 0;

        while (rounds < MAX_TOOL_ROUNDS) {
          rounds++;
          let text = "";
          const fragments: ToolCallDelta[] = [];

          for await (const chunk of gateway.chatStream({
            model: parsed.data.model,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...conversation],
            tools: toolDefinitions,
            signal: abort.signal,
          })) {
            if (chunk.delta !== null) {
              text += chunk.delta;
              sseEvent(res, { delta: chunk.delta });
            }
            if (chunk.toolCalls !== null) fragments.push(...chunk.toolCalls);
            if (chunk.usage !== null) sseEvent(res, { usage: chunk.usage });
            if (chunk.finishReason !== null) sseEvent(res, { finishReason: chunk.finishReason });
          }

          const calls = assembleToolCalls(fragments);
          if (calls.length === 0) {
            conversation.push({ role: "assistant", content: text });
            sseEvent(res, { done: true, rounds });
            return;
          }

          conversation.push({ role: "assistant", content: text, toolCalls: calls });
          for (const call of calls) {
            sseEvent(res, { tool: { name: call.name, phase: "start" } });
            const outcome = await executeTool(call.name, call.arguments, deps.sandboxRoot);
            conversation.push({ role: "tool", content: outcome.result, toolCallId: call.id });
            sseEvent(res, {
              tool: { name: call.name, phase: "done", ok: outcome.ok, summary: outcome.result.split("\n")[0] ?? "" },
            });
          }

          if (rounds >= MAX_TOOL_ROUNDS) {
            sseEvent(res, { error: `Stopped: tool round budget (${MAX_TOOL_ROUNDS}) exhausted. Send another message to continue.` });
            return;
          }
        }
      } catch (error) {
        // ModelsError messages are key-safe by contract in the models package.
        const message = error instanceof Error ? error.message : "stream failed";
        if (!abort.signal.aborted) {
          sseEvent(res, { error: message });
        }
      } finally {
        res.end();
      }
      return;
    }

    if (url.pathname === "/preview" || url.pathname.startsWith("/preview/")) {
      if (req.method === "GET") {
        servePreview(deps.sandboxRoot, url, res);
      } else {
        sendJson(res, 405, { error: "Method not allowed" });
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

  const sandboxRoot = process.env.SANDBOX_DIR
    ? path.resolve(process.env.SANDBOX_DIR)
    : path.join(process.cwd(), ".studio-sandbox");

  const server = createWebStudioServer({ gatewayFor, sandboxRoot });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Authenik8 Studio Web: http://127.0.0.1:${PORT}`);
    console.log(`Sandbox: ${sandboxRoot} (BYOK: your key stays in this tab)`);
  });
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
