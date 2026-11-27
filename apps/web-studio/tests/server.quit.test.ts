import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AgentRuntime } from "@authenik8/agent-adapter";

import { createWebStudioServer, type WebStudioDeps } from "../src/server.js";

const fakeRuntime: AgentRuntime = {
  id: "opencode",
  run: async () => ({
    ok: true,
    runtime: "opencode",
    command: [],
    exitCode: 0,
    timedOut: false,
    durationMs: 0,
    stdout: "",
    stderr: "",
    errorCode: null,
    sessionId: null,
  }),
};

function makeDeps(sandboxRoot: string): WebStudioDeps {
  return {
    gatewayFor: () => ({
      listModels: async () => [],
      chatStream: () => (async function* () {})(),
    }),
    sandboxRoot,
    agentRuntime: fakeRuntime,
    createRunner: () => ({ start: () => true, stop: () => {}, isRunning: () => false }),
  };
}

describe("studio quit", () => {
  let sandbox = "";
  let server: ReturnType<typeof createWebStudioServer> | null = null;

  afterEach(async () => {
    if (server !== null) {
      await new Promise<void>((resolve) => {
        try { server!.close(() => resolve()); } catch { resolve(); }
      });
      server = null;
    }
    if (sandbox) {
      await rm(sandbox, { recursive: true, force: true });
      sandbox = "";
    }
  });

  it("stops the local server on an explicit POST", async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "studio-quit-"));
    server = createWebStudioServer(makeDeps(sandbox));
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    const methodRes = await fetch(`${base}/api/studio/quit`, { method: "GET" });
    expect(methodRes.status).toBe(405);

    const quitRes = await fetch(`${base}/api/studio/quit`, { method: "POST" });
    expect(quitRes.status).toBe(200);
    expect(await quitRes.json()).toEqual({ ok: true });

    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(fetch(`${base}/studio`)).rejects.toBeTruthy();
    server = null; // already closed by quit
  });
});
