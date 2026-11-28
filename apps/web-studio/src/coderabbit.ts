import { spawn, type ChildProcess } from "node:child_process";

import { localToolEnvironment } from "./local-env.js";

type CommandResult = { code: number | null; output: string; missing: boolean };

function runCommand(command: "coderabbit" | "git", args: string[], cwd: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let child: ChildProcess | null = null;
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, output: output.slice(-24_000) });
    };
    const timer = setTimeout(() => {
      try { child?.kill(); } catch (error) { void error; /* best effort */ }
      finish({ code: null, output: "CodeRabbit timed out.", missing: false });
    }, timeoutMs);
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        // The CLI reads its own user-level auth store. Do not pass unrelated
        // process secrets (cloud keys, CI tokens, etc.) into a code-review tool.
        env: localToolEnvironment(),
      });
    } catch (error) {
      clearTimeout(timer);
      finish({ code: null, output: error instanceof Error ? error.message : "Could not start CodeRabbit.", missing: true });
      return;
    }
    const append = (chunk: Buffer): void => { output += chunk.toString("utf8"); if (output.length > 30_000) output = output.slice(-24_000); };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error: NodeJS.ErrnoException) => finish({
      code: null,
      output: error.code === "ENOENT" ? "CodeRabbit CLI was not found on PATH." : "Could not start CodeRabbit CLI.",
      missing: error.code === "ENOENT",
    }));
    child.on("close", (code) => finish({ code, output, missing: false }));
  });
}

export async function codeRabbitStatus(cwd: string): Promise<{ installed: boolean; authenticated: boolean; gitReady: boolean; detail: string }> {
  const git = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], cwd, 8_000);
  const gitReady = git.code === 0 && git.output.trim().endsWith("true");
  const version = await runCommand("coderabbit", ["--version"], cwd, 8_000);
  if (version.missing || version.code !== 0) {
    return { installed: false, authenticated: false, gitReady, detail: "CodeRabbit CLI not found on PATH." };
  }
  const auth = await runCommand("coderabbit", ["auth", "status", "--agent"], cwd, 15_000);
  return {
    installed: true,
    authenticated: auth.code === 0,
    gitReady,
    detail: auth.code === 0
      ? (gitReady ? "CLI installed, authenticated, and Git repository detected." : "CLI installed and authenticated. Initialize a Git repository in the project to review it.")
      : "CLI installed; sign in with `coderabbit auth login --agent`.",
  };
}

export async function reviewWithCodeRabbit(cwd: string): Promise<{ ok: boolean; output: string }> {
  const git = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], cwd, 8_000);
  if (git.code !== 0 || !git.output.trim().endsWith("true")) {
    return { ok: false, output: "This Studio project is not in a Git repository. Initialize Git in the project first, then check that secrets are excluded before reviewing." };
  }
  const result = await runCommand("coderabbit", ["review", "--agent", "--uncommitted", "--include-untracked"], cwd, 180_000);
  return {
    ok: result.code === 0,
    output: result.missing
      ? "CodeRabbit CLI was not found on PATH. Install it using the CodeRabbit documentation."
      : result.output.trim() || (result.code === 0 ? "Review finished with no output." : `CodeRabbit exited with code ${result.code ?? "unknown"}.`),
  };
}
