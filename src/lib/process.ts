import { spawn, spawnSync, ChildProcess } from "child_process";
import type { RunOptions } from "./types.js";

const activeProcesses = new Set<ChildProcess>();
const MAX_CAPTURED_OUTPUT = 16_000;

function appendOutput(current: string, chunk: unknown): string {
  const next = `${current}${String(chunk)}`;
  return next.length > MAX_CAPTURED_OUTPUT
    ? next.slice(next.length - MAX_CAPTURED_OUTPUT)
    : next;
}

export function run(cmd: string, args: string[],options: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? "ignore",

      env: options.env,
      shell: process.platform === "win32",
      windowsHide: true,

    });
    activeProcesses.add(child);
    let output = "";


    child.stdout?.on("data", (chunk) => {
      output = appendOutput(output, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      output = appendOutput(output, chunk);
    });

    child.on("close", (code, signal) => {

      activeProcesses.delete(child);
      if (code === 0) {
        resolve();
      } else {
        const reason = signal
          ? `${cmd} was interrupted by ${signal}`
          : `${cmd} exited with code ${code}`;
        const detail = output.trim();
        const error = new Error(detail ? `${reason}\n\n${detail}` : reason) as Error & {
          signal?: NodeJS.Signals;
        };
        if (signal) error.signal = signal;
        reject(error);
      }
    });

    child.on("error", (err:any) => {
      activeProcesses.delete(child);
      reject(err);
    });
  });
}

export function killAllProcesses(platform = process.platform) {
  for (const proc of activeProcesses) {
    try {
      if (platform === "win32" && proc.pid) {
        spawnSync("taskkill.exe", ["/pid", String(proc.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        proc.kill("SIGTERM");
      }
    } catch {}
  }
  activeProcesses.clear();
}

export function getCommand(cmd: string, platform = process.platform) {
  const isWin = platform === "win32";
  if (cmd === "npm") return isWin ? "npm.cmd" : "npm";
  if (cmd === "npx") return isWin ? "npx.cmd" : "npx";
  if (cmd === "pnpm") return isWin ? "pnpm.cmd" : "pnpm";
  if (cmd === "bun") return isWin ? "bun.exe" : "bun";
  if (cmd === "git") return isWin ? "git.exe" : "git";
  return cmd;
}

export function commandExists(cmd: string, platform = process.platform): boolean {
  const result = spawnSync(getCommand(cmd, platform), ["--version"], {
    stdio: "ignore",
    shell: platform === "win32",
    windowsHide: true,
  });

  return !result.error && result.status === 0;
}

export function isCommandNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function isInterruptedError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "signal" in err &&
    ((err as { signal?: string }).signal === "SIGINT" ||
      (err as { signal?: string }).signal === "SIGTERM")
  );
}

export async function exitForInterrupt(err: unknown) {
  if (isInterruptedError(err)) {
    throw err;
  }
}
