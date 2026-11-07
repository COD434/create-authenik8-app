import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Project runner for the studio: boots the generated project with FIXED
 * commands (`npm install`, then `npm start`). The studio never executes
 * model-chosen commands — the command shape is ours; only the project's
 * own scripts determine what runs, in the sandbox cwd, user-triggered.
 *
 * argv arrays only (no shell), output is untrusted data for display,
 * stop kills the process tree (npm holds children).
 */

export type RunnerPhase = "install" | "serve";
export type RunnerEvent =
  | { phase: RunnerPhase; code: null }
  | { phase: "exited"; code: number | null }
  | { phase: "failed"; code: number | null; message: string };

export type RunnerHandlers = {
  onEvent(event: RunnerEvent): void;
  onOutput(line: string): void;
};

export type Runner = {
  start(cwd: string): boolean;
  stop(): void;
  isRunning(): boolean;
};

/** `null` when npm could not be located next to the Node executable. */
export type RunnerCommands = {
  install: ReadonlyArray<string>;
  start: ReadonlyArray<string>;
} | null;

export function npmCommands(): RunnerCommands {
  // Standard Node installs ship npm next to the node executable; invoking
  // `node npm-cli.js` avoids Windows .cmd shims, which no-shell spawn
  // cannot resolve.
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(npmCli)) return null;
  return {
    install: [process.execPath, npmCli, "install", "--no-audit", "--no-fund"],
    start: [process.execPath, npmCli, "start"],
  };
}

function killTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    } catch {
      // Best effort; the direct kill already ran.
    }
  }
}

export function createRunner(commands: RunnerCommands, handlers: RunnerHandlers): Runner {
  let running = false;
  let stopRequested = false;
  let child: ChildProcess | null = null;
  let lineBuffer = "";

  function capture(stream: NodeJS.ReadableStream): void {
    stream.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf8");
      let newline = lineBuffer.indexOf("\n");
      while (newline !== -1) {
        const line = lineBuffer.slice(0, newline).replace(/\r$/, "");
        if (line !== "") handlers.onOutput(line);
        lineBuffer = lineBuffer.slice(newline + 1);
        newline = lineBuffer.indexOf("\n");
      }
    });
  }

  function runPhase(argv: ReadonlyArray<string>, cwd: string): Promise<number | null> {
    return new Promise((resolve, reject) => {
      try {
        child = spawn(argv[0]!, [...argv.slice(1)], {
          cwd,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        reject(new Error((error as NodeJS.ErrnoException).code === "ENOENT" ? "command not found" : "spawn failed"));
        return;
      }
      capture(child.stdout!);
      capture(child.stderr!);
      child.on("error", (error: NodeJS.ErrnoException) => {
        reject(new Error(error.code === "ENOENT" ? "command not found" : "spawn failed"));
      });
      child.on("close", (code) => resolve(code));
    });
  }

  return {
    isRunning: () => running,

    start(cwd: string): boolean {
      if (running) return false;
      running = true;
      stopRequested = false;

      void (async () => {
        try {
          if (commands === null) {
            handlers.onEvent({ phase: "failed", code: null, message: "npm CLI not found next to the Node executable" });
            return;
          }
          if (existsSync(path.join(cwd, "package.json"))) {
            handlers.onEvent({ phase: "install", code: null });
            const installCode = await runPhase(commands.install, cwd);
            if (stopRequested) return;
            if (installCode !== 0) {
              handlers.onEvent({ phase: "failed", code: installCode, message: "npm install failed" });
              return;
            }
          }
          handlers.onEvent({ phase: "serve", code: null });
          const serveCode = await runPhase(commands.start, cwd);
          handlers.onEvent({
            phase: "exited",
            code: stopRequested ? null : serveCode,
          });
        } catch (error) {
          handlers.onEvent({
            phase: "failed",
            code: null,
            message: error instanceof Error ? error.message : "runner failed",
          });
        } finally {
          child = null;
          running = false;
        }
      })();

      return true;
    },

    stop(): void {
      if (!running) return;
      stopRequested = true;
      if (child?.pid !== undefined) {
        killTree(child.pid);
        try {
          child.kill();
        } catch {
          // Already dead.
        }
      }
    },
  };
}
