import { spawn } from "node:child_process";
import path from "node:path";

import type { AgentRunErrorCode, AgentRunRequest, AgentRunResult } from "./types.js";

/**
 * Generic runtime-process layer shared by command-based adapters.
 * Spawns an argv array (never a shell), captures output with a hard cap,
 * enforces timeouts and aborts, and performs best-effort process-tree
 * cleanup on Windows and POSIX.
 */

const DEFAULT_TIMEOUT_MS = 600_000;
const GRACE_KILL_MS = 2_000;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

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

export async function spawnAgent(
  argv: ReadonlyArray<string>,
  options: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<SpawnOutcome> {
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
