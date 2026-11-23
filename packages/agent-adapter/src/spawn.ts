import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import type { AgentRunErrorCode, AgentRunRequest, AgentRunResult, AgentStreamEvent } from "./types.js";

/**
 * Generic runtime-process layer shared by command-based adapters.
 * Spawns an argv array (never a shell), captures output with a hard cap,
 * enforces timeouts and aborts, and performs best-effort process-tree
 * cleanup on Windows and POSIX. Optionally streams well-formed NDJSON
 * lines to a caller callback as they arrive (live event pass-through).
 */

const DEFAULT_TIMEOUT_MS = 600_000;
const GRACE_KILL_MS = 2_000;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
/** A single stdout line larger than this is dropped, never parsed. */
const MAX_LINE_CHARS = 256 * 1024;
/** Hard bound on accepted stream events per run (flood guard). */
const MAX_STREAM_EVENTS = 5_000;

export type SpawnOutcome = Pick<
  AgentRunResult,
  "exitCode" | "timedOut" | "durationMs" | "stdout" | "stderr" | "errorCode"
>;

function killTree(pid: number): void {
  if (process.platform === "win32") {
    // Windows: terminate the whole tree; spawned runtimes commonly hold
    // child processes (servers, shells) that survive a plain kill().
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    } catch {
      // Best effort; the direct kill below already ran.
    }
  }
}

function forceKill(child: import("node:child_process").ChildProcess): void {
  try {
    child.kill();
  } catch {
    // Already dead or unreapable — nothing further to do.
  }
  const timer = setTimeout(() => killTree(child.pid!), GRACE_KILL_MS);
  timer.unref?.();
}

function captureStream(stream: NodeJS.ReadableStream, sink: { bytes: number; text: string }): void {
  stream.on("data", (chunk: Buffer) => {
    const previousBytes = sink.bytes;
    sink.bytes += chunk.length;
    if (sink.bytes <= MAX_CAPTURE_BYTES) {
      sink.text += chunk.toString("utf8");
      return;
    }
    // This chunk crossed the cap: mark truncation once, then drain without
    // storing. The cap is a memory bound, not an exact-size promise.
    if (previousBytes <= MAX_CAPTURE_BYTES) {
      sink.text += "\n… [output truncated at capture cap]";
    }
  });
}

/**
 * Split a stdout stream into lines as they arrive. Oversized lines are
 * discarded whole (buffer reset + byte scan to the terminating newline)
 * so one pathological line cannot exhaust memory or stall the parser.
 */
function streamLines(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let buffer = "";
  let discarding = false;
  stream.on("data", (chunk: Buffer) => {
    if (discarding) {
      const end = chunk.indexOf(0x0a); // newline byte
      if (end === -1) return; // still inside the oversized line
      chunk = chunk.subarray(end + 1);
      discarding = false;
    }
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.length <= MAX_LINE_CHARS) onLine(line);
      newline = buffer.indexOf("\n");
    }
    if (buffer.length > MAX_LINE_CHARS) {
      discarding = true;
      buffer = "";
    }
  });
}

export async function spawnAgent(
  argv: ReadonlyArray<string>,
  options: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    signal?: AbortSignal;
    onEvent?: (event: AgentStreamEvent) => void;
  } = {},
): Promise<SpawnOutcome> {
  // Pre-flight: spawn() reports a nonexistent cwd as ENOENT, indistinguishable
  // from a missing executable. Check it so the failure is honest (a bad cwd
  // is a caller bug, not a missing runtime).
  if (options.cwd !== undefined && !existsSync(options.cwd)) {
    return {
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      stdout: "",
      stderr: "",
      errorCode: "bad_cwd",
    };
  }

  const started = Date.now();
  const stdout = { bytes: 0, text: "" };
  const stderr = { bytes: 0, text: "" };

  return new Promise((resolve) => {
    let child: import("node:child_process").ChildProcess;
    try {
      child = spawn(argv[0]!, argv.slice(1), {
        cwd: options.cwd ?? undefined,
        env: options.env ? { ...process.env, ...options.env } : undefined,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - started,
        stdout: "",
        stderr: "",
        errorCode: (error as NodeJS.ErrnoException).code === "ENOENT" ? "runtime_missing" : "spawn_failed",
      });
      return;
    }

    captureStream(child.stdout!, stdout);
    captureStream(child.stderr!, stderr);

    const onEvent = options.onEvent;
    if (onEvent !== undefined) {
      let accepted = 0;
      streamLines(child.stdout!, (line) => {
        if (accepted >= MAX_STREAM_EVENTS) return;
        const candidate = line.trim();
        if (candidate === "" || !candidate.startsWith("{")) return;
        try {
          const data: unknown = JSON.parse(candidate);
          onEvent({ index: accepted, data });
          accepted++;
        } catch {
          // Malformed NDJSON line: dropped, never fatal.
        }
      });
    }

    let settled = false;
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) forceKill(child);
    }, timeoutMs);
    timer.unref?.();

    const onAbort = () => {
      if (child.pid !== undefined) forceKill(child);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (exitCode: number | null, errorCode: AgentRunErrorCode | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) {
        resolve({
          exitCode: null,
          timedOut,
          durationMs: Date.now() - started,
          stdout: stdout.text,
          stderr: stderr.text,
          errorCode: "aborted",
        });
        return;
      }
      resolve({
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        stdout: stdout.text,
        stderr: stderr.text,
        errorCode,
      });
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(null, error.code === "ENOENT" ? "runtime_missing" : "spawn_failed");
    });
    child.on("close", (code) => {
      if (timedOut) {
        finish(null, "timeout");
        return;
      }
      if (options.signal?.aborted) {
        finish(code, "aborted");
        return;
      }
      finish(code, code === 0 ? null : "nonzero_exit");
    });
  });
}

/** Resolve a runtime CLI path, tolerating executable extensions on Windows. */
export function resolveCommandPath(cliPath: string): string {
  if (path.isAbsolute(cliPath) || !cliPath.includes(path.sep)) return cliPath;
  return path.resolve(cliPath);
}
