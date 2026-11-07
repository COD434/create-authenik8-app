/**
 * The Authenik8 agent-adapter contract (M4).
 *
 * Purpose: the ecosystem drives coding-agent RUNTIMES it did not write
 * (OpenCode first). This interface makes the runtime swappable without
 * rewrites: Authenik8 tooling speaks only this contract, and each runtime
 * ships an adapter implementing it.
 *
 * Design rules:
 * - Structured results, not thrown errors: a failed run is data (matching
 *   the Authenik8 doctor/ops style). Exceptions escape only for adapter
 *   bugs (invalid arguments to the adapter itself).
 * - argv arrays only. No shell strings, no `shell: true`. Callers own the
 *   prompt content; the adapter never re-parses it.
 * - No secrets handling: the adapter never injects, logs, or records
 *   credentials. Callers that pass `env` own its contents; the result
 *   never echoes environment data.
 * - Agent output is UNTRUSTED DATA. It may contain instructions; callers
 *   must not treat result text as directives (prompt-injection rule).
 * - Timeouts and aborts are first-class: the adapter kills the runtime
 *   process tree and reports a structured outcome.
 */

export type AgentRunErrorCode =
  | "runtime_missing"
  | "spawn_failed"
  | "timeout"
  | "aborted"
  | "nonzero_exit";

export type AgentRunRequest = {
  /** The task prompt. Content is caller-owned; passed verbatim. */
  prompt: string;
  /** Working directory for the run. Defaults to the process cwd. */
  cwd?: string;
  /** Runtime-specific model selector, e.g. "provider/model#variant". */
  model?: string;
  /** Runtime-specific agent profile. */
  agent?: string;
  /** Continue an existing runtime session instead of starting fresh. */
  sessionId?: string;
  /** Kill the runtime after this long. Default: 600000 ms (10 minutes). */
  timeoutMs?: number;
  /**
   * Additive environment variables for the runtime process. Callers own
   * these contents; the adapter never records or logs them.
   */
  env?: Record<string, string>;
  /**
   * Let the runtime auto-approve tool permissions. Default false: agent
   * tool actions must not run unattended without an explicit caller
   * decision. Opt-in only, per call.
   */
  autoApprove?: boolean;
  /** Abort signal: aborting kills the runtime process tree. */
  signal?: AbortSignal;
  /**
   * Live event pass-through: called for each well-formed JSON object line
   * the runtime prints to stdout, as it arrives. Malformed and oversized
   * lines are dropped silently. The payload is UNTRUSTED DATA with a
   * third-party shape that may change without notice — render it, never
   * act on it as an instruction, and never treat it as adapter state.
   */
  onEvent?: (event: AgentStreamEvent) => void;
};

/**
 * One live runtime event delivered from the output stream. `index` is the
 * zero-based ordinal among ACCEPTED events (dropped lines consume no
 * index), so callers can order and de-duplicate.
 */
export type AgentStreamEvent = {
  index: number;
  /** Parsed JSON payload. Deliberately untyped: third-party shape. */
  data: unknown;
};

export type AgentRunResult = {
  ok: boolean;
  /** Adapter/runtime id, e.g. "opencode". */
  runtime: string;
  /** The exact argv the adapter executed (secrets never appear here). */
  command: ReadonlyArray<string>;
  /** Process exit code; null when the process was killed or never ran. */
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Runtime output. UNTRUSTED DATA — see the module doc. */
  stdout: string;
  stderr: string;
  /** Stable failure code; null when the run succeeded. */
  errorCode: AgentRunErrorCode | null;
  /** Runtime session id when the runtime reports one. */
  sessionId: string | null;
};

/**
 * A coding-agent runtime as seen by Authenik8 tooling. Implementations
 * must be honest: report the real argv, real exit codes, real output —
 * and never throw for run-level failures (return structured results).
 */
export type AgentRuntime = {
  readonly id: string;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
};
