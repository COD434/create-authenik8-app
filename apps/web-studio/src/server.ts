import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createModelsGateway, createOpenRouterProvider, listPublicModels } from "@authenik8/models";
import { createOpenCodeRuntime } from "@authenik8/agent-adapter";

import { createLeaseManager, type LeaseManager } from "./directory-lease.js";
import { resolveOpenCodePath } from "./opencode-path.js";
import { createRunner, type Runner } from "./runner.js";
import {
  createLegacyRunAdapterState,
  createStudioEventStream,
  fromLegacyRunSseEvent,
} from "./execution-events.js";
import { isTrustedLocalMutation, sendJson, sseEvent } from "./http.js";
import { type RouteContext, type StudioSession, type WebStudioDeps } from "./studio-types.js";
import { servePreview } from "./preview.js";
import { serveStaticFile } from "./routes/static.js";
import { handleCodeRabbitRoutes } from "./routes/coderabbit.js";
import { handleModelRoutes } from "./routes/models.js";
import { handleHistoryRoutes } from "./routes/history.js";
import { handleGithubRoutes } from "./routes/github.js";
import { handleDeployRoutes } from "./routes/deploy.js";
import { handleSubagentRoutes } from "./routes/subagents.js";
import { handleProjectRoutes } from "./routes/project.js";
import { handleRunRoutes } from "./routes/run.js";
import { handleTemplateRoute } from "./routes/template.js";
import { handleAgentRoute } from "./routes/agent.js";
import { handleChatRoute } from "./routes/chat.js";

export type { WebStudioDeps } from "./studio-types.js";
/**
 * Studio Web (M5 v1): a localhost ChatGPT-style builder chat with a sandboxed
 * tool loop — the model can list, read, and write real files, streamed over
 * the Authenik8 models gateway (BYOK, free OpenRouter models).
 *
 * Trust boundary:
 * - binds 127.0.0.1 only; state-changing requests validate loopback Host and
 *   same-origin browser metadata (plus no CORS);
 * - the OpenRouter key arrives per request in the X-OpenRouter-Key header
 *   and is never stored, logged, or echoed;
 * - tool execution is confined to the sandbox root (path-guarded);
 * - the conversation is an append-only JSONL log inside the sandbox
 *   (.authenik8/session.jsonl): local-only, excluded from preview, export,
 *   and the file tools; reset starts a new conversation;
 * - runtime context is a generated, logged system snapshot of project names
 *   and package metadata; `.env` values and absolute paths are never read;
 * - the OpenCode agent is triggered ONLY by explicit user action and always
 *   runs with auto-approve scoped to the sandbox cwd; its output is
 *   untrusted data and is never treated as instructions;
 * - no request logging, no telemetry.
 */

const DEFAULT_MAX_TOOL_ROUNDS = 12;
const MAX_TOOL_ROUNDS_CAP = 30;

export function createWebStudioServer(deps: WebStudioDeps): Server {
  // Single-user localhost tool: one durable conversation per sandbox;
  // /api/reset starts a new one.
  const session: StudioSession = { log: null, agentBusy: false, chatBusy: false, runRes: null };
  // Directory leases are process-local and shared across chat turns. A builder
  // holds one for the duration of its synchronous child run.
  const leases = createLeaseManager();
  const maxToolRounds = Math.min(
    MAX_TOOL_ROUNDS_CAP,
    Math.max(1, Math.trunc(deps.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS)),
  );

  // Project runner wiring: run output streams to whoever holds the SSE.
  let runStudio = createStudioEventStream();
  let runStudioState = createLegacyRunAdapterState("local-session", `turn_run_${Date.now().toString(36)}`);
  let runActive = false;
  const emitRun = (payload: Record<string, unknown>): void => {
    if (session.runRes === null || session.runRes.destroyed) return;
    sseEvent(session.runRes, payload);
    const studioEvents = fromLegacyRunSseEvent(payload, runStudioState, runStudio);
    if (studioEvents.length > 0) sseEvent(session.runRes, { studio: studioEvents });
  };
  const runner = deps.createRunner({
    onEvent: (event) => {
      if (!runActive && (event.phase === "install" || event.phase === "build" || event.phase === "serve")) {
        runActive = true;
        runStudio = createStudioEventStream();
        runStudioState = createLegacyRunAdapterState("local-session", `turn_run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
      }
      emitRun({ run: event });
      if (event.phase === "exited" || event.phase === "failed") {
        runActive = false;
        if (session.runRes !== null && !session.runRes.destroyed) session.runRes.end();
        session.runRes = null;
      }
    },
    onOutput: (line) => {
      emitRun({ runOut: line });
    },
  });

  const server = createServer((req, res) => {
    void handle(deps, session, runner, leases, maxToolRounds, req, res);
  });
  server.on("close", () => runner.stop());
  return server;
}

async function handle(
  deps: WebStudioDeps,
  session: StudioSession,
  runner: Runner,
  leases: LeaseManager,
  maxToolRounds: number,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const ctx: RouteContext = { deps, session, runner, leases, maxToolRounds, req, res, url };

  try {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "") && !isTrustedLocalMutation(req)) {
      sendJson(res, 403, { error: "This local action must come from the Studio page." });
      return;
    }

    if (await serveStaticFile(ctx)) return;
    if (await handleCodeRabbitRoutes(ctx)) return;
    if (await handleModelRoutes(ctx)) return;
    if (await handleHistoryRoutes(ctx)) return;
    if (await handleGithubRoutes(ctx)) return;
    if (await handleDeployRoutes(ctx)) return;
    if (await handleSubagentRoutes(ctx)) return;
    if (await handleProjectRoutes(ctx)) return;
    if (await handleRunRoutes(ctx)) return;
    if (await handleTemplateRoute(ctx)) return;
    if (await handleAgentRoute(ctx)) return;
    if (await handleChatRoute(ctx)) return;

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

/** Optional character budget override, clamped to a sane local range. */
function contextBudgetFromEnv(): number | undefined {
  const raw = process.env.AUTHENIK8_CONTEXT_CHARS;
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(400_000, Math.max(4_000, Math.trunc(parsed)));
}

/** Optional parent tool-round override, clamped to the same local range as deps. */
function maxToolRoundsFromEnv(): number {
  const raw = process.env.AUTHENIK8_MAX_TOOL_ROUNDS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_TOOL_ROUNDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOL_ROUNDS;
  return Math.min(MAX_TOOL_ROUNDS_CAP, Math.max(1, Math.trunc(parsed)));
}

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
  const contextBudgetChars = contextBudgetFromEnv();
  const maxToolRounds = maxToolRoundsFromEnv();

  // The agent runtime spawns opencode directly (no shell), so npm's .cmd
  // shims never resolve on Windows — resolve the underlying executable the
  // installed CLI actually ships (npm global @opencode/cli, the official
  // installer layout), with OPENCODE_PATH as the explicit override. When
  // nothing is found the bare "opencode" stays: a PATH spawn works on POSIX,
  // and Windows fails closed with install guidance in the agent modal.
  const agentRuntime = createOpenCodeRuntime({
    cliPath: resolveOpenCodePath(process.env, homedir(), process.platform) ?? "opencode",
  });

  const server = createWebStudioServer({
    gatewayFor,
    publicModels: () => listPublicModels(),
    sandboxRoot,
    ...(contextBudgetChars !== undefined ? { contextBudgetChars } : {}),
    maxToolRounds,
    agentRuntime,
    createRunner,
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
      console.log(`Authenik8: ${url}`);
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
