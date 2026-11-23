import { spawnAgent } from "./spawn.js";
import type { AgentRunRequest, AgentRunResult, AgentRuntime } from "./types.js";

/**
 * OpenCode adapter (`opencode run`).
 *
 * Argv is built against the OpenCode v2 CLI surface (verified against the
 * installed `opencode run --help` at build time of this snapshot; OpenCode
 * is a third-party CLI and its flags may evolve — the builder is pure and
 * unit-tested, adjust it there when OpenCode changes).
 *
 * Safety defaults:
 * - `autoApprove` maps to OpenCode's `--auto` and is NEVER sent unless the
 *   caller explicitly sets it per request.
 * - The prompt is passed after `--` as a single argument so prompt text
 *   can never be parsed as CLI flags.
 * - Runs default to the shared background service; pass `standalone: true`
 *   for hermetic private-server runs.
 */

export type OpenCodeRuntimeOptions = {
  /** Absolute or PATH-resolvable opencode executable. Default "opencode". */
  cliPath?: string;
  /** Run against a private server instead of the shared background service. */
  standalone?: boolean;
};

const SESSION_ID_PATTERN = /"session(?:ID|_id|Id)"\s*:\s*"([^"]+)"/i;

/** Build the `opencode run` argv for a request (pure; unit-tested). */
export function buildOpenCodeRunArgs(
  request: Pick<AgentRunRequest, "prompt" | "model" | "agent" | "sessionId" | "autoApprove">,
  options: { standalone?: boolean; title?: string } = {},
): Array<string> {
  const args: Array<string> = ["run", "--format", "json"];
  if (options.standalone === true) args.push("--standalone");
  if (request.model !== undefined) args.push("--model", request.model);
  if (request.agent !== undefined) args.push("--agent", request.agent);
  if (request.sessionId !== undefined) args.push("--session", request.sessionId);
  if (request.autoApprove === true) args.push("--auto");
  args.push("--", request.prompt);
  return args;
}

/**
 * Opportunistically extract a session id from OpenCode's `--format json`
 * output (newline-delimited JSON events). The output shape is third-party
 * data: extraction is tolerant and returns null rather than guessing.
 */
export function extractSessionId(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (trimmed === "") return null;

  // NDJSON: parse line by line; return the first session id found.
  for (const line of trimmed.split("\n")) {
    const candidate = line.trim();
    if (candidate === "" || !candidate.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === "object") {
        const direct = (parsed as Record<string, unknown>)["sessionID"]
          ?? (parsed as Record<string, unknown>)["sessionId"];
        if (typeof direct === "string" && direct.length > 0) return direct;
        const nested = (parsed as Record<string, unknown>)["session"];
        if (nested !== null && typeof nested === "object") {
          const id = (nested as Record<string, unknown>)["id"];
          if (typeof id === "string" && id.length > 0) return id;
        }
      }
    } catch {
      // Not this line's shape — keep scanning.
    }
  }

  const match = trimmed.match(SESSION_ID_PATTERN);
  return match?.[1] ?? null;
}

export function createOpenCodeRuntime(options: OpenCodeRuntimeOptions = {}): AgentRuntime {
  const cliPath = options.cliPath ?? "opencode";

  return {
    id: "opencode",

    async run(request: AgentRunRequest): Promise<AgentRunResult> {
      const argv = [cliPath, ...buildOpenCodeRunArgs(
        request,
        { ...(options.standalone !== undefined ? { standalone: options.standalone } : {}) },
      )];
      const outcome = await spawnAgent(argv, {
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
        ...(request.env !== undefined ? { env: request.env } : {}),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
        ...(request.onEvent !== undefined ? { onEvent: request.onEvent } : {}),
      });

      const result: AgentRunResult = {
        ok: outcome.errorCode === null,
        runtime: "opencode",
        command: argv,
        exitCode: outcome.exitCode,
        timedOut: outcome.timedOut,
        durationMs: outcome.durationMs,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        errorCode: outcome.errorCode,
        sessionId: extractSessionId(outcome.stdout),
      };
      return result;
    },
  };
}
