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

describe("spawnAgent live event pass-through (NDJSON)", () => {
  it("delivers parsed events incrementally, in order, before the run resolves", async () => {
    const events: Array<{ at: number; event: import("../src/types.js").AgentStreamEvent }> = [];
    const outcome = await spawnAgent(
      [
        process.execPath,
        "-e",
        [
          "console.log(JSON.stringify({ type: 'step', part: 1 }));",
          "setTimeout(() => { console.log(JSON.stringify({ type: 'step', part: 2 })); }, 250);",
          "setTimeout(() => {}, 400);", // keep the process alive after the last event
        ].join(""),
      ],
      { onEvent: (event) => events.push({ at: Date.now(), event }) },
    );

    expect(outcome.errorCode).toBeNull();
    expect(events.map((entry) => entry.event.data)).toEqual([
      { type: "step", part: 1 },
      { type: "step", part: 2 },
    ]);
    expect(events.map((entry) => entry.event.index)).toEqual([0, 1]);
    // Incremental delivery, not end-of-run buffering: the second event
    // arrived well after the first, while the process was still running.
    expect(events[1]!.at - events[0]!.at).toBeGreaterThanOrEqual(200);
  });

  it("drops malformed and oversized lines and keeps capture intact", async () => {
    const events: import("../src/types.js").AgentStreamEvent[] = [];
    const outcome = await spawnAgent(
      [
        process.execPath,
        "-e",
        [
          "console.log('plain banner line');",
          "console.log('{not json');",
          "console.log(JSON.stringify({ ok: true }));",
          "console.log(JSON.stringify({ big: 'x'.repeat(300 * 1024) }));",
        ].join(""),
      ],
      { onEvent: (event) => events.push(event) },
    );

    expect(outcome.errorCode).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toEqual({ ok: true });
    expect(outcome.stdout).toContain("plain banner line"); // capture unaffected
    expect(outcome.stdout).toContain("\"big\"");
  });

  it("stops delivering after the flood cap", async () => {
    const events: import("../src/types.js").AgentStreamEvent[] = [];
    await spawnAgent(
      [
        process.execPath,
        "-e",
        "for (let i = 0; i < 6000; i++) console.log(JSON.stringify({ i }));",
      ],
      { onEvent: (event) => events.push(event) },
    );
    expect(events).toHaveLength(5_000);
    expect(events[4_999]!.index).toBe(4_999);
  });

  it("delivers nothing when no callback is provided", async () => {
    const outcome = await spawnAgent([
      process.execPath,
      "-e",
      "console.log(JSON.stringify({ ignored: true }))",
    ]);
    expect(outcome.errorCode).toBeNull();
    expect(outcome.stdout).toContain("ignored");
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
