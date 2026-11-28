import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Project runner for the studio: boots the generated project with FIXED
 * command shapes (`npm install`, an optional `npm run build`, `npm start`).
 * The studio never executes model-chosen commands — the command shapes are
 * ours; only the project's own scripts decide what runs, in the sandbox
 * cwd, user-triggered.
 *
 * The optional build step exists for CLI-seeded templates whose start entry
 * is compiled output (`node dist/server.js`): when the project itself
 * declares a `build` script and that entry is missing, the run builds
 * first. This is manifest-declared project work, not studio policy.
 *
 * argv arrays only (no shell), output is untrusted data for display,
 * stop kills the process tree (npm holds children).
 */

export type RunnerPhase = "install" | "build" | "serve";
export type RunnerStep = { phase: RunnerPhase; argv: ReadonlyArray<string> };
export type RunnerCommands = { steps: ReadonlyArray<RunnerStep> } | null;

export type RunnerEvent =
  | { phase: RunnerPhase; code: null }
  | { phase: "exited"; code: number | null }
  | { phase: "failed"; code: number | null; message: string };

export type RunnerHandlers = {
  onEvent(event: RunnerEvent): void;
  onOutput(line: string): void;
};

export type Runner = {
  start(cwd: string, commands: RunnerCommands): boolean;
  stop(): void;
  isRunning(): boolean;
};

/** `null` when npm could not be located next to the Node executable. */
export type NpmCommands = {
  install: ReadonlyArray<string>;
  start: ReadonlyArray<string>;
} | null;

function npmCliPath(): string {
  // Standard Node installs ship npm next to the node executable; invoking
  // `node npm-cli.js` avoids Windows .cmd shims, which no-shell spawn
  // cannot resolve.
  return path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}

/**
 * Fixed-shape run commands for a project. `npm run build` is inserted ONLY
 * when the project declares a build script AND its start entry is a plain
 * `node <file>` that does not exist yet (compiled-output starts). Existing
 * entries run as declared.
 */
export async function npmRunCommands(cwd: string): Promise<RunnerCommands> {
  const npmCli = npmCliPath();
  if (!existsSync(npmCli)) return null;

  const steps: RunnerStep[] = [
    { phase: "install", argv: [process.execPath, npmCli, "install", "--no-audit", "--no-fund"] },
  ];

  const manifest = await readFile(path.join(cwd, "package.json"), "utf8")
    .then((raw) => JSON.parse(raw) as { scripts?: Record<string, string> })
    .catch(() => null);
  if (manifest === null) {
    // Nothing to install: serve whatever exists. The run route's blocker
    // normally prevents a manifest-less sandbox from reaching the runner.
    return { steps: [{ phase: "serve", argv: [process.execPath, npmCli, "start"] }] };
  }
  const scripts = manifest.scripts;
  const start = typeof scripts?.start === "string" ? scripts.start : null;
  const build = typeof scripts?.build === "string" ? scripts.build : null;
  if (start !== null && build !== null) {
    const entry = /^node\s+(\S+)\s*$/.exec(start.trim())?.[1];
    if (entry !== undefined && !existsSync(path.resolve(cwd, entry))) {
      steps.push({ phase: "build", argv: [process.execPath, npmCli, "run", "build"] });
    }
  }

  steps.push({ phase: "serve", argv: [process.execPath, npmCli, "start"] });
  return { steps };
}

function killTree(pid: number): void {
  if (process.platform === "win32") {
    // Snapshot descendants while the tree is intact. taskkill /T misses
    // grandchildren when an intermediate (npm's cmd shim) dies mid-walk,
    // which is how an orphan keeps holding the app's port after a stop.
    const table = windowsProcessTable();
    const descendants = new Set<number>();
    const collect = (parent: number): void => {
      for (const row of table) {
        if (row.ppid === parent && !descendants.has(row.pid)) {
          descendants.add(row.pid);
          collect(row.pid);
        }
      }
    };
    collect(pid);
    try {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    } catch (error) {
      void error; // Best effort; the sweep below still runs.
    }
    const alive = new Set(windowsProcessTable().map((row) => row.pid));
    for (const straggler of descendants) {
      if (!alive.has(straggler)) continue;
      try {
        spawnSync("taskkill", ["/F", "/PID", String(straggler)], { stdio: "ignore", windowsHide: true });
      } catch (error) {
        void error; // Already dead or already gone.
      }
    }
  }
}

/** `{pid, ppid}` rows for every process, via CIM (wmic is removed on current Windows). */
function windowsProcessTable(): Array<{ pid: number; ppid: number }> {
  try {
    const out = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"],
      { windowsHide: true, encoding: "utf8", timeout: 5000 },
    );
    return (out.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter((pair): pair is [number, number] => pair.length === 2 && pair.every(Number.isFinite))
      .map(([pid, ppid]) => ({ pid, ppid }));
  } catch {
    return [];
  }
}

type RunnerState = {
  running: boolean;
  stopRequested: boolean;
  child: ChildProcess | null;
  lineBuffer: string;
};

function captureStream(stream: NodeJS.ReadableStream, state: RunnerState, handlers: RunnerHandlers): void {
  stream.on("data", (chunk: Buffer) => {
    state.lineBuffer += chunk.toString("utf8");
    let newline = state.lineBuffer.indexOf("\n");
    while (newline !== -1) {
      const line = state.lineBuffer.slice(0, newline).replace(/\r$/, "");
      if (line !== "") handlers.onOutput(line);
      state.lineBuffer = state.lineBuffer.slice(newline + 1);
      newline = state.lineBuffer.indexOf("\n");
    }
  });
}

function runPhase(
  argv: ReadonlyArray<string>,
  cwd: string,
  state: RunnerState,
  handlers: RunnerHandlers,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    try {
      state.child = spawn(argv[0]!, [...argv.slice(1)], {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new Error((error as NodeJS.ErrnoException).code === "ENOENT" ? "command not found" : "spawn failed"));
      return;
    }
    captureStream(state.child.stdout!, state, handlers);
    captureStream(state.child.stderr!, state, handlers);
    state.child.on("error", (error: NodeJS.ErrnoException) => {
      reject(new Error(error.code === "ENOENT" ? "command not found" : "spawn failed"));
    });
    state.child.on("close", (code) => resolve(code));
  });
}

async function runSteps(
  commands: RunnerCommands,
  cwd: string,
  state: RunnerState,
  handlers: RunnerHandlers,
): Promise<void> {
  try {
    if (commands === null) {
      handlers.onEvent({ phase: "failed", code: null, message: "npm CLI not found next to the Node executable" });
      return;
    }
    const serveStep = commands.steps.at(-1);
    const preSteps = commands.steps.slice(0, -1);
    for (const step of preSteps) {
      handlers.onEvent({ phase: step.phase, code: null });
      const code = await runPhase(step.argv, cwd, state, handlers);
      if (state.stopRequested) {
        // A stop must always end with the terminal event: it is what
        // closes the run's SSE stream.
        handlers.onEvent({ phase: "exited", code: null });
        return;
      }
      if (code !== 0) {
        handlers.onEvent({ phase: "failed", code, message: `${step.phase} failed` });
        return;
      }
    }
    if (serveStep !== undefined) {
      handlers.onEvent({ phase: "serve", code: null });
      const serveCode = await runPhase(serveStep.argv, cwd, state, handlers);
      handlers.onEvent({
        phase: "exited",
        code: state.stopRequested ? null : serveCode,
      });
    }
  } catch (error) {
    handlers.onEvent({
      phase: "failed",
      code: null,
      message: error instanceof Error ? error.message : "runner failed",
    });
  } finally {
    state.child = null;
    state.running = false;
  }
}

export function createRunner(handlers: RunnerHandlers): Runner {
  const state: RunnerState = { running: false, stopRequested: false, child: null, lineBuffer: "" };

  return {
    isRunning: () => state.running,

    start(cwd: string, commands: RunnerCommands): boolean {
      if (state.running) return false;
      state.running = true;
      state.stopRequested = false;
      void runSteps(commands, cwd, state, handlers);
      return true;
    },

    stop(): void {
      if (!state.running) return;
      state.stopRequested = true;
      if (state.child?.pid !== undefined) {
        killTree(state.child.pid);
        try {
          state.child.kill();
        } catch (error) {
          void error; // Already dead.
        }
      }
    },
  };
}
