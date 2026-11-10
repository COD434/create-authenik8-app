import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
import { createOpenCodeRuntime, type AgentRuntime } from "@authenik8/agent-adapter";

import { executeTool, resolveInsideSandbox, toolDefinitions } from "./tools.js";
import { createRunner, npmCommands, type Runner, type RunnerHandlers } from "./runner.js";
import { createZip, type ZipEntry } from "./zip.js";

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
 * - the OpenCode agent is triggered ONLY by explicit user action and always
 *   runs with auto-approve scoped to the sandbox cwd; its output is
 *   untrusted data and is never treated as instructions;
 * - no request logging, no telemetry.
 */

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TOOL_ROUNDS = 6;
/**
 * Some free models sit behind providers that only accept traffic from coding
 * agents: any plain app call gets 403 "only available on agentic harnesses"
 * (observed first-hand with the then-default dropdown entry). The auto-router
 * accepts app traffic, so it is the reliable first-run default and the one-shot
 * fallback for that error class.
 */
const FALLBACK_MODEL = "openrouter/free";
const AGENT_OUTPUT_TAIL_CHARS = 4_000;
const MAX_EXPORT_FILES = 2_000;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

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
  /** The coding-agent runtime (OpenCode). Triggered only by explicit user action. */
  agentRuntime: AgentRuntime;
  /** Project runner factory (npm install/start). Fixed commands, user-triggered. */
  createRunner(handlers: RunnerHandlers): Runner;
};

const agentBodySchema = z.object({
  prompt: z.string().min(1).max(8_000),
});

const AGENT_BRIEF_PREAMBLE = [
  "You are the Authenik8 build agent working inside a project directory.",
  "Build a real, runnable project for the brief below using Authenik8 conventions:",
  "Express + TypeScript, rotating JWTs with stateful server-side sessions, Prisma,",
  "strict cookies, CSRF protection, and server-side authorization.",
  "Never put secrets in client code; never store tokens in browser storage.",
  "When you finish, print a short summary of what you created.",
].join(" ");

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
  "Every project root must include a package.json whose scripts.start boots the app.",
  "For a static site, also write a tiny zero-dependency node server.js that serves the",
  "directory (npm start = node server.js) so the user can run it, not only preview it.",
  "Authenik8-generated projects use Express + TypeScript, rotating JWTs with stateful",
  "Redis-backed sessions, Prisma, strict cookies, CSRF, and server-side authorization.",
  "Never suggest client-held secrets, tokens in browser storage, frontend route guards",
  "as authorization, or disabling CSRF/origin checks. Prefer free-tier OpenRouter models",
  "and plain, reviewable code.",
].join(" ");

/**
 * The zero-dependency static server the studio writes into a static sandbox
 * before a run: `npm start = node server.js` so Run works for every
 * chat-generated app, deterministic content (no model round-trip).
 */
const BOOTSTRAP_SERVER_JS = `// Written by Authenik8 Studio Web: minimal zero-dependency static server.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT ?? 3000);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2" };

http.createServer((req, res) => {
  let name;
  try {
    name = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400); res.end(); return;
  }
  if (name === "/") name = "/index.html";
  if (name.startsWith("/") === false || name.includes("..") || /(^|\\/)\\./.test(name.slice(1))) {
    res.writeHead(403); res.end(); return;
  }
  const file = path.join(root, name);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(\`Static app on http://127.0.0.1:\${port}\`));
`;

const BOOTSTRAP_MANIFEST = {
  name: "authenik8-static-app",
  private: true,
  scripts: { start: "node server.js" },
};

/**
 * Provision a runnable project for a STATIC sandbox in place: write only the
 * files that are missing (never clobber model/user files), then let the run
 * proceed. Returns null when something usable was already bootstrapped (or
 * skipped because present), otherwise the 422 copy for a sandless state.
 */
async function ensureStaticRunnable(sandboxRoot: string): Promise<{ note: string } | string | null> {
  let manifestRaw: string | null = null as null | string;
  try {
    manifestRaw = await readFile(path.join(sandboxRoot, "package.json"), "utf8");
  } catch {
    manifestRaw = null;
  }

  if (manifestRaw === null) {
    let hasIndexHtml = true;
    try {
      await stat(path.join(sandboxRoot, "index.html"));
    } catch {
      hasIndexHtml = false;
    }
    if (!hasIndexHtml) {
      return "Nothing to run yet: the sandbox is empty. Describe the app to build, then Run.";
    }

    const notes: string[] = [];
    let serverJs: string | null = null;
    try {
      serverJs = await readFile(path.join(sandboxRoot, "server.js"), "utf8");
    } catch {
      serverJs = null;
    }
    if (serverJs === null) {
      // Missing → write the deterministic one; a custom server.js is never clobbered.
      await writeFile(path.join(sandboxRoot, "server.js"), BOOTSTRAP_SERVER_JS, "utf8");
      notes.push("wrote a zero-dependency server.js");
    }
    await writeFile(path.join(sandboxRoot, "package.json"), JSON.stringify(BOOTSTRAP_MANIFEST, null, 2) + "\n", "utf8");
    notes.push("added package.json with a start script");

    return { note: `Authenik8 bootstrapped the static project for Run: ${notes.join(", ")} (no model call, no dependencies).` };
  }

  // Manifest exists: a model may have promised scripts.start -> node <entry>
  // but never written the entry file (observed live: package.json with
  // "node server.js", no server.js — node crashed instantly). If the entry is
  // a simple module at the sandbox root and the app is static, write the
  // deterministic server AT THAT PATH so the run cannot dead-end. Nothing is
  // clobbered: the file is only written when missing.
  let manifest2: { scripts?: Record<string, unknown> } | null = null;
  try {
    manifest2 = JSON.parse(manifestRaw) as { scripts?: Record<string, unknown> };
  } catch {
    return null; // runBlocker teaches the fix for malformed manifests
  }
  const start = manifest2?.scripts?.start;
  if (typeof start === "string") {
    const nodeEntry = /^node\s+([A-Za-z0-9_.-]+\.[cm]?js)$/i.exec(start.trim());
    if (nodeEntry !== null) {
      const entryPath = path.join(sandboxRoot, nodeEntry[1]!);
      try {
        await stat(entryPath);
      } catch {
        let hasIndexHtml = false;
        try {
          await stat(path.join(sandboxRoot, "index.html"));
          hasIndexHtml = true;
        } catch {
          hasIndexHtml = false;
        }
        if (hasIndexHtml) {
          await writeFile(entryPath, BOOTSTRAP_SERVER_JS, "utf8");
          return {
            note: `Authenik8 wrote ${nodeEntry[1]} (zero-dependency static server) because scripts.start referenced it but the file was missing (no model call, no dependencies).`,
          };
        }
      }
    }
  }
  return null;
}
async function runBlocker(sandboxRoot: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(sandboxRoot, "package.json"), "utf8");
  } catch {
    return "No package.json in the sandbox yet: static apps are already live in the Preview pane. To run a server, ask the assistant to add a package.json with a start script.";
  }
  let manifest: { scripts?: Record<string, unknown> };
  try {
    manifest = JSON.parse(raw) as { scripts?: Record<string, unknown> };
  } catch {
    return "The sandbox package.json is not valid JSON — ask the assistant to fix it, then run again.";
  }
  const start = manifest.scripts?.start;
  if (typeof start !== "string" || start.length === 0) {
    return "The sandbox package.json has no start script — ask the assistant to add one (e.g. \"start\": \"node server.js\"), then run again.";
  }
  return null;
}

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

/**
 * Collect sandbox project files for export: skips dotfiles (.env never
 * leaves the machine) and node_modules, with hard caps on file count and
 * total bytes. Zip names use forward slashes per the ZIP convention.
 */
async function collectProjectFiles(sandboxRoot: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let totalBytes = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (entries.length >= MAX_EXPORT_FILES || depth > 12) return;
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (entries.length >= MAX_EXPORT_FILES || totalBytes > MAX_EXPORT_BYTES) return;
      if (dirent.name.startsWith(".") || dirent.name === "node_modules") continue;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (dirent.isFile()) {
        const data = await readFile(full);
        totalBytes += data.length;
        if (totalBytes > MAX_EXPORT_BYTES) return;
        entries.push({ name: path.relative(sandboxRoot, full).split(path.sep).join("/"), data });
      }
    }
  }

  await walk(sandboxRoot, 0);
  return entries;
}

function apiKeyFrom(req: IncomingMessage): string | null {
  const header = req.headers["x-openrouter-key"];
  const value = Array.isArray(header) ? header[0] : header;
  const key = value?.trim() ?? "";
  return key.length > 0 ? key : null;
}

/** JSON body parse that reports malformed input instead of throwing. */
function parseJsonBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type StudioSession = {
  conversation: ChatMessage[];
  agentBusy: boolean;
  runRes: ServerResponse | null;
};

export function createWebStudioServer(deps: WebStudioDeps): Server {
  // Single-user localhost tool: one conversation in memory; /api/reset wipes it.
  const session: StudioSession = { conversation: [], agentBusy: false, runRes: null };

  // Project runner wiring: run output streams to whoever holds the SSE.
  const runner = deps.createRunner({
    onEvent: (event) => {
      if (session.runRes !== null && !session.runRes.destroyed) sseEvent(session.runRes, { run: event });
      if (event.phase === "exited" || event.phase === "failed") {
        if (session.runRes !== null && !session.runRes.destroyed) session.runRes.end();
        session.runRes = null;
      }
    },
    onOutput: (line) => {
      if (session.runRes !== null && !session.runRes.destroyed) sseEvent(session.runRes, { runOut: line });
    },
  });

  return createServer((req, res) => {
    void handle(deps, session, runner, req, res);
  });
}

async function handle(
  deps: WebStudioDeps,
  session: StudioSession,
  runner: Runner,
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
      const models = (await deps.gatewayFor(key).listModels())
        .filter((model) => model.isFree && model.supportsTools);
      // Predictable default: the app-traffic-accepting auto-router first.
      const ranked = [
        ...models.filter((model) => model.id === FALLBACK_MODEL),
        ...models.filter((model) => model.id !== FALLBACK_MODEL),
      ];
      sendJson(res, 200, {
        models: ranked.map((model) => ({ id: model.id, name: model.name, contextLength: model.contextLength })),
      });
      return;
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      session.conversation.length = 0;
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/export" && req.method === "GET") {
      // Consistent with /api/run and /api/agent: the sandbox may not exist
      // yet (nothing has been generated). Bootstrap it so a first-run
      // export returns a valid empty ZIP instead of a 500.
      await mkdir(deps.sandboxRoot, { recursive: true });
      const files = await collectProjectFiles(deps.sandboxRoot);
      const zip = createZip(files);
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="authenik8-project.zip"',
        "cache-control": "no-store",
      });
      res.end(zip);
      return;
    }

    if (url.pathname === "/api/run/status" && req.method === "GET") {
      sendJson(res, 200, { running: runner.isRunning() });
      return;
    }

    if (url.pathname === "/api/run" && req.method === "POST") {
      if (runner.isRunning()) {
        sendJson(res, 409, { error: "The project is already running" });
        return;
      }
      // Static apps get runnable in place first: deterministic local files
      // (package.json + server.js), never clobbered, then the normal gate.
      const provisioned = await ensureStaticRunnable(deps.sandboxRoot);
      if (typeof provisioned === "string") {
        sendJson(res, 422, { error: provisioned });
        return;
      }
      // Fail closed when the sandbox holds no runnable project: npm would
      // otherwise resolve scripts outside the sandbox (it walks up the tree).
      const blocker = await runBlocker(deps.sandboxRoot);
      if (blocker !== null) {
        sendJson(res, 422, { error: blocker });
        return;
      }
      // npm spawn needs a real cwd: bootstrap the sandbox if it does not
      // exist yet (no chat/agent run may have created it).
      await mkdir(deps.sandboxRoot, { recursive: true });
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.flushHeaders(); // headers go out even before the runner emits anything
      session.runRes = res;
      if (provisioned !== null) {
        sseEvent(res, { runOut: provisioned.note }); // top of the output, before install lines
      }
      runner.start(deps.sandboxRoot); // fixed commands; events stream via session.runRes
      return;
    }

    if (url.pathname === "/api/run/stop" && req.method === "POST") {
      runner.stop();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/agent" && req.method === "POST") {
      if (session.agentBusy) {
        sendJson(res, 409, { error: "An agent run is already in progress" });
        return;
      }
      const body = await readBody(req);
      if (body === null) {
        sendJson(res, 413, { error: "Request body too large" });
        return;
      }
      const rawAgent = parseJsonBody(body);
      if (rawAgent === undefined) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const parsed = agentBodySchema.safeParse(rawAgent);
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

      // The user's button click is the consent for auto-approve; the run is
      // scoped to the sandbox cwd. Failures are data, not exceptions.
      session.agentBusy = true;
      sseEvent(res, { agent: { phase: "start" } });
      try {
        // OpenCode spawns with the sandbox as cwd: it must exist first.
        await mkdir(deps.sandboxRoot, { recursive: true });
        const result = await deps.agentRuntime.run({
          prompt: `${AGENT_BRIEF_PREAMBLE}\n\nBrief: ${parsed.data.prompt}`,
          cwd: deps.sandboxRoot,
          autoApprove: true,
          signal: abort.signal,
          // Live NDJSON pass-through: untrusted third-party events relayed
          // verbatim as data. Dropped when the client already hung up.
          onEvent: (event) => {
            if (!res.destroyed) sseEvent(res, { agentEvent: event });
          },
        });
        sseEvent(res, {
          agent: {
            phase: "done",
            ok: result.ok,
            errorCode: result.errorCode,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            sessionId: result.sessionId,
            outputTail: result.stdout.slice(-AGENT_OUTPUT_TAIL_CHARS),
            ...(result.ok ? {} : { errorTail: result.stderr.slice(-AGENT_OUTPUT_TAIL_CHARS) }),
          },
        });
      } catch (error) {
        // Adapter bugs only; run-level failures are structured results.
        const message = error instanceof Error ? error.message : "agent run failed";
        sseEvent(res, { agent: { phase: "done", ok: false, errorCode: "spawn_failed", errorTail: message } });
      } finally {
        session.agentBusy = false;
        res.end();
      }
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
      const rawChat = parseJsonBody(body);
      if (rawChat === undefined) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const parsed = chatBodySchema.safeParse(rawChat);
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

      session.conversation.push({ role: "user", content: parsed.data.message });

      try {
        const gateway = deps.gatewayFor(key);

        const generate = async (model: string): Promise<void> => {
          let rounds = 0;

          while (rounds < MAX_TOOL_ROUNDS) {
            rounds++;
            let text = "";
            const fragments: ToolCallDelta[] = [];

            for await (const chunk of gateway.chatStream({
              model,
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...session.conversation],
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
              session.conversation.push({ role: "assistant", content: text });
              sseEvent(res, { done: true, rounds });
              return;
            }

            session.conversation.push({ role: "assistant", content: text, toolCalls: calls });
            for (const call of calls) {
              sseEvent(res, { tool: { name: call.name, phase: "start" } });
              const outcome = await executeTool(call.name, call.arguments, deps.sandboxRoot);
              session.conversation.push({ role: "tool", content: outcome.result, toolCallId: call.id });
              sseEvent(res, {
                tool: { name: call.name, phase: "done", ok: outcome.ok, summary: outcome.result.split("\n")[0] ?? "" },
              });
            }

            if (rounds >= MAX_TOOL_ROUNDS) {
              sseEvent(res, { error: `Stopped: tool round budget (${MAX_TOOL_ROUNDS}) exhausted. Send another message to continue.` });
              return;
            }
          }
        };

        try {
          await generate(parsed.data.model);
        } catch (error) {
          const message = error instanceof Error ? error.message : "stream failed";
          if (
            message.includes("agentic harnesses")
            && parsed.data.model !== FALLBACK_MODEL
            && !abort.signal.aborted
          ) {
            // Agent-only providers 403 the whole product: complete this
            // message with the app-traffic router instead of dead-ending.
            sseEvent(res, {
              note: `${parsed.data.model} rejects app traffic (agents-only provider), so Authenik8 completed this message with ${FALLBACK_MODEL}. Pick it in the dropdown to keep it.`,
            });
            await generate(FALLBACK_MODEL);
          } else if (!abort.signal.aborted) {
            sseEvent(res, { error: message });
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

export type StudioStartOptions = {
  /** Preferred port; it falls back to the next ten when busy (default: PORT env or 4870). */
  port?: number;
  /** Called once the server answers on its final URL — the launcher opens the browser here. */
  onReady?: (url: string) => void;
};

/**
 * Boot the studio with port discipline: a busy preferred port falls back to
 * the next ten before giving up with a clear message — a first-run developer
 * meets the URL line, never a raw EADDRINUSE stack. Returns the server so a
 * programmatic caller (tests) can close it.
 */
export function startStudio(options: StudioStartOptions = {}): Server {
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

  // OPENCODE_PATH: the real executable (Windows npm shims are .cmd and are
  // not resolvable by no-shell spawn — pass the .exe explicitly there).
  const agentRuntime = createOpenCodeRuntime({
    cliPath: process.env.OPENCODE_PATH ?? "opencode",
  });

  const server = createWebStudioServer({
    gatewayFor,
    sandboxRoot,
    agentRuntime,
    createRunner: (handlers) => createRunner(npmCommands(), handlers),
  });

  const preferred = options.port ?? Number(process.env.PORT ?? 4870);
  const lastResort = preferred + 10;
  const attempt = (port: number): void => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && port < lastResort) {
        attempt(port + 1);
      } else if (error.code === "EADDRINUSE") {
        console.error(`Ports ${preferred}-${lastResort} are all busy. Free one up, or set PORT to a different base.`);
        process.exit(1);
      } else {
        throw error;
      }
    });
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`Authenik8 Studio Web: ${url}`);
      console.log(`Sandbox: ${sandboxRoot} (BYOK: your key stays in this tab)`);
      options.onReady?.(url);
    });
  };
  attempt(preferred);
  return server;
}

export function main(): void {
  startStudio();
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
