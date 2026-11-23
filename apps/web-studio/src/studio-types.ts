import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { AgentRuntime } from "@authenik8/agent-adapter";
import type { ModelInfo, ModelsGateway } from "@authenik8/models";

import type { LeaseManager } from "./directory-lease.js";
import { RUNTIME_CONTEXT_PREFIX } from "./runtime-context.js";
import type { Runner, RunnerHandlers } from "./runner.js";
import { SESSION_DIR, SESSION_FILE, SessionLog } from "./session-log.js";
import type { Bridge } from "./template-bridge.js";

/** The auto-router accepts app traffic, so it is the reliable first-run default. */
export const FALLBACK_MODEL = "openrouter/free";

export type WebStudioDeps = {
  /** Build a gateway for one request's key; the server stores nothing. */
  gatewayFor(apiKey: string): Pick<ModelsGateway, "listModels" | "chatStream">;
  /**
   * Keyless model discovery for zero-key browsing (OpenRouter's public
   * catalog). Optional for tests; startStudio wires the real one.
   */
  publicModels?: () => Promise<ModelInfo[]>;
  /** Sandbox root for tool execution; created on demand. */
  sandboxRoot: string;
  /**
   * Character budget for the model-visible history. Older tool results are
   * summarized above it; the durable log is never rewritten. Defaults to
   * DEFAULT_CONTEXT_BUDGET_CHARS.
   */
  contextBudgetChars?: number;
  /**
   * Parent tool rounds before one final no-tools summary call. Defaults to
   * DEFAULT_MAX_TOOL_ROUNDS and is clamped to 1..MAX_TOOL_ROUNDS_CAP.
   */
  maxToolRounds?: number;
  /** The coding-agent runtime (OpenCode). Triggered only by explicit user action. */
  agentRuntime: AgentRuntime;
  /** Project runner factory (npm install/start). Fixed commands, user-triggered. */
  createRunner(handlers: RunnerHandlers): Runner;
  /**
   * Template bridge override (tests). When absent, the route resolves
   * AUTHENIK8_CLI_PATH / the host npm against the real environment.
   */
  bridge?: Bridge;
  /**
   * Outbound HTTP for user-triggered Supabase checks and static deploys.
   * Tests inject a fake; production uses the global fetch. Tokens still
   * arrive per request and are never stored.
   */
  integrationFetch?: typeof fetch;
};

export type StudioSession = {
  /**
   * Durable conversation log, created on first use so a caller may set the
   * sandbox root after the server object exists (the tests do exactly that).
   */
  log: SessionLog | null;
  agentBusy: boolean;
  chatBusy: boolean;
  runRes: ServerResponse | null;
};

/** Everything one route needs: dependencies, per-process state, and the wire. */
export type RouteContext = {
  deps: WebStudioDeps;
  session: StudioSession;
  runner: Runner;
  leases: LeaseManager;
  maxToolRounds: number;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
};

export function sessionLog(deps: WebStudioDeps, session: StudioSession): SessionLog {
  session.log ??= new SessionLog(path.join(deps.sandboxRoot, SESSION_DIR, SESSION_FILE));
  return session.log;
}

/**
 * Append the runtime context only when it differs from the last one in the
 * log. The reminder is a logged system message, not UI state, so a replay
 * sees exactly what the model saw.
 */
export async function ensureRuntimeContext(log: SessionLog, content: string): Promise<void> {
  const history = await log.history();
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index];
    if (message === undefined || message.role !== "system") continue;
    if (!message.content.startsWith(RUNTIME_CONTEXT_PREFIX)) continue;
    if (message.content === content) return;
    break;
  }
  await log.append({ role: "system", content });
}
