import { spawn, ChildProcess } from "child_process";
import type { RunOptions } from "./types.js";

const activeProcesses = new Set<ChildProcess>();

export function run(cmd: string, args: string[], options: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: "ignore",
    });
    activeProcesses.add(child);

    child.on("exit", (code) => {
      activeProcesses.delete(child);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      activeProcesses.delete(child);
      reject(err);
    });
  });
}

export function killAllProcesses() {
  for (const proc of activeProcesses) {
    try {
      proc.kill("SIGINT");
    } catch {}
  }
  activeProcesses.clear();
}

export function getCommand(cmd: string) {
  const isWin = process.platform === "win32";
  if (cmd === "npm") return isWin ? "npm.cmd" : "npm";
  if (cmd === "npx") return isWin ? "npx.cmd" : "npx";
  if (cmd === "pnpm") return isWin ? "pnpm.cmd" : "pnpm";
  if (cmd === "bun") return isWin ? "bun.exe" : "bun";
  if (cmd === "git") return isWin ? "git.exe" : "git";
  return cmd;
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
