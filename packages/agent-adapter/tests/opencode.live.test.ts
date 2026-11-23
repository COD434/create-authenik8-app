import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createOpenCodeRuntime } from "../src/opencode.js";

/**
 * LIVE test against the real OpenCode CLI. Skipped unless OPENCODE_EXE is
 * set to the executable path (npm shims cannot be spawned without a shell).
 * Makes one tiny, tool-free model call; auto-approve stays off.
 */
const exe = process.env.OPENCODE_EXE;
const workdir = mkdtempSync(path.join(tmpdir(), "authenik8-agent-live-"));

afterAll(() => {
  try {
    // Windows can briefly hold locks on files the runtime just wrote;
    // rmSync retries the usual suspects, and anything it cannot remove is
    // left for OS temp-dir reclamation rather than failing the suite.
    rmSync(workdir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Leave the temp directory; the OS reclaims it.
  }
});

describe.skipIf(exe === undefined)("opencode live run", () => {
  it("runs a trivial prompt and reports a real session", { timeout: 180_000 }, async () => {
    const runtime = createOpenCodeRuntime({ cliPath: exe! });
    const result = await runtime.run({
      prompt: "Reply with exactly: OK",
      cwd: workdir,
      timeoutMs: 150_000,
    });

    expect(result.ok).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.sessionId).toMatch(/^ses_/);
    expect(result.stdout).toContain("OK");
    // argv never contains credential material by construction.
    expect(result.command.join(" ")).not.toMatch(/(api[_-]?key|bearer|token)\s*[:=]/i);
  });
});
