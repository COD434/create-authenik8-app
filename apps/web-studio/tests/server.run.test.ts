import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { startStudio } from "../src/server.js";
import {
  base,
  getRunnerHandlers,
  runnerState,
  sandbox,
} from "./support/studio-harness.js";

describe("run routes", () => {
  beforeEach(async () => {
    // A runnable sandbox: npm must resolve scripts.start INSIDE the sandbox.
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { start: "node server.js" } }),
      "utf8",
    );
  });

  it("streams runner events and output over SSE", async () => {
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(runnerState.started).toBe(1);
    expect(getRunnerHandlers()).not.toBeNull();

    // Emit a full run lifecycle, then drain: the terminal event ends the stream.
    getRunnerHandlers()!.onEvent({ phase: "install", code: null });
    getRunnerHandlers()!.onOutput("added 512 packages");
    getRunnerHandlers()!.onEvent({ phase: "serve", code: null });
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 });

    const text = await res.text();
    expect(text).toContain('"phase":"install"');
    expect(text).toContain("added 512 packages");
    expect(text).toContain('"phase":"serve"');
    expect(text).toContain('"phase":"exited"');
  });

  it("composes a build step for manifests whose start entry is compiled and missing", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { build: "tsc", start: "node dist/server.js" } }),
      "utf8",
    );
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 }); // end the stream
    await res.text(); // drain the SSE stream
    expect(runnerState.commands).not.toBeNull();
    expect(runnerState.commands!.steps.map((step) => step.phase)).toEqual(["install", "build", "serve"]);
    expect(runnerState.commands!.steps[1]!.argv.slice(-2)).toEqual(["run", "build"]);
  });

  it("skips the build step once the compiled entry exists", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { build: "tsc", start: "node dist/server.js" } }),
      "utf8",
    );
    await mkdir(path.join(sandbox, "dist"), { recursive: true });
    await writeFile(path.join(sandbox, "dist", "server.js"), "", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 }); // end the stream
    await res.text(); // drain the SSE stream
    expect(runnerState.commands!.steps.map((step) => step.phase)).toEqual(["install", "serve"]);
  });

  it("fails closed when the sandbox has nothing runnable (npm would walk up out of the sandbox)", async () => {
    await rm(path.join(sandbox, "package.json"), { force: true });
    await rm(path.join(sandbox, "index.html"), { force: true });
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("Nothing to run yet");
    expect(runnerState.started).toBe(0);
  });

  it("auto-bootstraps a static sandbox in place and runs it â€” no model call needed", async () => {
    // A chat-generated static app from before the package.json contract.
    await rm(path.join(sandbox, "package.json"), { force: true });
    await rm(path.join(sandbox, "server.js"), { force: true });
    await writeFile(path.join(sandbox, "index.html"), "<h1>static app</h1>", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(runnerState.started).toBe(1);

    // The manifests landed on disk, not just in memory.
    const manifest = JSON.parse(await readFile(path.join(sandbox, "package.json"), "utf8")) as {
      scripts?: { start?: string };
    };
    expect(manifest.scripts?.start).toBe("node server.js");
    const serverJs = await readFile(path.join(sandbox, "server.js"), "utf8");
    expect(serverJs).toContain("node:http");
    // A custom server.js is never clobbered:
    await writeFile(path.join(sandbox, "server.js"), "// custom", "utf8");
    await rm(path.join(sandbox, "package.json"), { force: true });
    await writeFile(path.join(sandbox, "index.html"), "<h1>static app 2</h1>", "utf8");

    // Drain the first stream, then re-run to verify the clobber-free path.
    getRunnerHandlers()!.onEvent({ phase: "serve", code: null });
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 });
    const first = await res.text();
    expect(first).toContain("bootstrapped");
    expect(first).toContain("wrote a zero-dependency server.js");

    const second = await fetch(`${base}/api/run`, { method: "POST" });
    expect(second.status).toBe(200);
    expect(runnerState.started).toBe(2);
    // custom server.js survived the bootstrap.
    expect(await readFile(path.join(sandbox, "server.js"), "utf8")).toBe("// custom");
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 });
    const secondText = await second.text();
    expect(secondText).toContain("added package.json with a start script");
    expect(secondText).not.toContain("wrote a zero-dependency server.js");
  });

  it("fails closed when package.json has no start script", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { dev: "vite" } }),
      "utf8",
    );
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("start");
    expect(runnerState.started).toBe(0);
  });

  it("fails closed on an unparseable package.json", async () => {
    await writeFile(path.join(sandbox, "package.json"), "{ not json", "utf8");
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("valid JSON");
    expect(runnerState.started).toBe(0);
  });

  it("writes the missing entry file scripts.start references instead of skipping run", async () => {
    // Observed live: the model promised "node server.js" but never wrote it.
    await rm(path.join(sandbox, "server.js"), { force: true });
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "pomodoro-timer", scripts: { start: "node server.js" } }),
      "utf8",
    );
    await writeFile(path.join(sandbox, "index.html"), "<h1>timer</h1>", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(runnerState.started).toBe(1);

    const serverJs = await readFile(path.join(sandbox, "server.js"), "utf8");
    expect(serverJs).toContain("node:http");

    getRunnerHandlers()!.onEvent({ phase: "serve", code: null });
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 });
    const text = await res.text();
    expect(text).toContain("because scripts.start referenced it");
  });

  it("never rewrites a start command it cannot implement (non-node scripts pass through)", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "vite dev --port 5173" } }),
      "utf8",
    );
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200); // the project's own commands remain the project's
    expect(runnerState.started).toBe(1);
  });

  it("refreshes a stale studio-owned entry file to the current template", async () => {
    // A sandbox provisioned by an earlier studio version keeps running with
    // the old template unless the studio owns and refreshes its own files.
    await writeFile(
      path.join(sandbox, "server.js"),
      "// Written by Authenik8 Studio Web: minimal zero-dependency static server.\nconst http = require('node:http');\nhttp.createServer(() => {}).listen(3000);\n",
      "utf8",
    );
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "node server.js" } }),
      "utf8",
    );
    await writeFile(path.join(sandbox, "index.html"), "<h1>app</h1>", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(runnerState.started).toBe(1);
    const serverJs = await readFile(path.join(sandbox, "server.js"), "utf8");
    expect(serverJs).toContain("EADDRINUSE"); // the resilient-port template

    getRunnerHandlers()!.onEvent({ phase: "serve", code: null });
    getRunnerHandlers()!.onEvent({ phase: "exited", code: 0 });
    const text = await res.text();
    expect(text).toContain("refreshed server.js");
  });

  it("never touches a model-written entry file that shares the name", async () => {
    const custom = "console.log('the model wrote me');\n";
    await writeFile(path.join(sandbox, "server.js"), custom, "utf8");
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "node server.js" } }),
      "utf8",
    );

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(runnerState.started).toBe(1);
    expect(await readFile(path.join(sandbox, "server.js"), "utf8")).toBe(custom);
  });

  it("409s a second run while the project is already running", async () => {
    runnerState.running = true;
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(runnerState.started).toBe(0);

    const status = await fetch(`${base}/api/run/status`);
    expect(await status.json()).toEqual({ running: true });
  });

  it("stops the project through the runner", async () => {
    const res = await fetch(`${base}/api/run/stop`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(runnerState.stopped).toBe(1);
  });
});

describe("startStudio port discipline", () => {
  it("falls back to the next free port when the preferred one is busy", async () => {
    // Something else already owns a port (the first-run dev's classic bind collision).
    const occupant = createNetServer();
    await new Promise<void>((resolve) => occupant.listen(0, "127.0.0.1", resolve));
    const busyPort = (occupant.address() as AddressInfo).port;

    const started = startStudio({ port: busyPort });
    try {
      // The busy port is skipped. Another worker may own the next one too,
      // so the contract is "a higher free port", not exactly busyPort + 1.
      await vi.waitFor(() => {
        const final = started.address() as AddressInfo | null;
        expect(final !== null && final.port > busyPort).toBe(true);
      });
      const finalPort = (started.address() as AddressInfo).port;
      expect(finalPort).toBeGreaterThan(busyPort);
    } finally {
      started.closeAllConnections();
      await new Promise<void>((resolve) => started.close(() => resolve()));
      await new Promise<void>((resolve) => occupant.close(() => resolve()));
    }
  });
});
