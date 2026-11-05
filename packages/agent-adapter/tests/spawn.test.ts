import { describe, expect, it } from "vitest";
import { AgentRunResult, AgentRunRequest } from "../src/types.js";
import type { AgentRuntime } from "../src/types.js";
import { spawnAgent } from "../src/spawn.js";

const SLEEPER = "setTimeout(() => {}, 5000)";

describe("spawnAgent (generic runtime-process layer)", () => {
  it("captures output and success for a clean run", async () => {
    const outcome = await spawnAgent([
      process.execPath,
      "-e",
      "console.log('agent output'); console.error('diag note')",
    ]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.errorCode).toBeNull();
    expect(outcome.stdout).toContain("agent output");
    expect(outcome.stderr).toContain("diag note");
    expect(outcome.timedOut).toBe(false);
  });

  it("reports nonzero exits with the structured code", async () => {
    const outcome = await spawnAgent([
      process.execPath,
      "-e",
      "console.error('boom'); process.exit(3)",
    ]);
    expect(outcome.exitCode).toBe(3);
    expect(outcome.errorCode).toBe("nonzero_exit");
    expect(outcome.stderr).toContain("boom");
  });

  it("kills on timeout and reports it structurally", async () => {
    const outcome = await spawnAgent([process.execPath, "-e", SLEEPER], { timeoutMs: 300 });
    expect(outcome.timedOut).toBe(true);
    expect(outcome.errorCode).toBe("timeout");
    expect(outcome.exitCode).toBeNull();
    expect(outcome.durationMs).toBeLessThan(5_000);
  });

  it("kills on abort and reports the aborted code", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 250);
    const outcome = await spawnAgent([process.execPath, "-e", SLEEPER], { signal: controller.signal });
    expect(outcome.errorCode).toBe("aborted");
    expect(outcome.exitCode).toBeNull();
    expect(outcome.durationMs).toBeLessThan(5_000);
  });

  it("reports a missing runtime executable as runtime_missing", async () => {
    const outcome = await spawnAgent(["definitely-not-a-real-agent-binary-xyz", "--version"]);
    expect(outcome.errorCode).toBe("runtime_missing");
    expect(outcome.exitCode).toBeNull();
  });

  it("caps runaway output instead of exhausting memory", async () => {
    const outcome = await spawnAgent([
      process.execPath,
      "-e",
      "console.log('x'.repeat(5 * 1024 * 1024))",
    ]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout.length).toBeLessThan(5 * 1024 * 1024);
    expect(outcome.stdout).toContain("[output truncated at capture cap]");
  });

  it("passes additive env to the runtime process", async () => {
    const outcome = await spawnAgent(
      [process.execPath, "-e", "console.log(process.env.A8_TEST_MARKER ?? 'missing')"],
      { env: { A8_TEST_MARKER: "present" } },
    );
    expect(outcome.stdout.trim()).toBe("present");
  });
});

describe("AgentRuntime contract swap-ability", () => {
  it("lets any implementation answer to the same consumer", async () => {
    const fake: AgentRuntime = {
      id: "fake",
      run: async (request: AgentRunRequest): Promise<AgentRunResult> => ({
        ok: true,
        runtime: "fake",
        command: ["fake", request.prompt],
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
        stdout: `echo:${request.prompt}`,
        stderr: "",
        errorCode: null,
        sessionId: "ses_fake",
      }),
    };

    // The consumer below is what Authenik8 tooling would be: it knows the
    // interface, not the runtime.
    async function driveAgent(runtime: AgentRuntime): Promise<string> {
      const result = await runtime.run({ prompt: "plan the auth boundary" });
      return result.ok ? result.stdout : `failed:${result.errorCode}`;
    }

    expect(await driveAgent(fake)).toBe("echo:plan the auth boundary");
  });
});
