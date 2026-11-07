import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createRunner, type RunnerCommands, type RunnerEvent } from "../src/runner.js";

let sandbox: string;
const node = process.execPath;

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "a8-runner-"));
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});
});

function harness() {
  const events: RunnerEvent[] = [];
  const output: string[] = [];
  const start = (commands: RunnerCommands) =>
    createRunner(commands, {
      onEvent: (event) => events.push(event),
      onOutput: (line) => output.push(line),
    });
  return { events, output, start };
}

describe("createRunner", () => {
  it("installs then serves, streaming output lines", async () => {
    const { events, output, start } = harness();
    await writeFile(path.join(sandbox, "package.json"), "{}", "utf8"); // install runs only with a manifest
    const runner = start({
      install: [node, "-e", "console.log('installing'); require('fs').writeFileSync('installed.txt', 'yes')"],
      start: [node, "-e", "console.log('serving'); let i = 0; const t = setInterval(() => { console.log('tick'); if (++i > 20) process.exit(0); }, 50);"],
    });

    expect(runner.start(sandbox)).toBe(true);
    expect(runner.isRunning()).toBe(true);

    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "install")).toBe(true);
      expect(output).toContain("installing");
    });
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "serve")).toBe(true);
      expect(output.some((line) => line.startsWith("tick"))).toBe(true);
    });

    runner.stop();
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "exited")).toBe(true);
      expect(runner.isRunning()).toBe(false);
    });
    expect(await readFile(path.join(sandbox, "installed.txt"), "utf8")).toBe("yes");
  });

  it("skips install when there is no package.json and still serves", async () => {
    const { events, output, start } = harness();
    const runner = start({
      install: [node, "-e", "process.exit(3)"],
      start: [node, "-e", "console.log('serving static'); setTimeout(() => process.exit(0), 100);"],
    });

    runner.start(sandbox);
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "serve")).toBe(true);
      expect(output).toContain("serving static");
      expect(events.some((event) => event.phase === "exited" && event.code === 0)).toBe(true);
    });
    expect(events.some((event) => event.phase === "failed")).toBe(false);
  });

  it("reports install failures as data and never starts", async () => {
    const { events, output, start } = harness();
    await writeFile(path.join(sandbox, "package.json"), "{}", "utf8");
    const runner = start({
      install: [node, "-e", "console.error('boom'); process.exit(3)"],
      start: [node, "-e", "console.log('should not run')"],
    });

    runner.start(sandbox);
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "failed" && event.code === 3)).toBe(true);
    });
    expect(output).not.toContain("should not run");
  });

  it("refuses a second start while running", async () => {
    const { events, start } = harness();
    const runner = start({
      install: [node, "-e", "process.exit(0)"],
      start: [node, "-e", "console.log('up'); setTimeout(() => process.exit(0), 300);"],
    });

    expect(runner.start(sandbox)).toBe(true);
    expect(runner.start(sandbox)).toBe(false);
    runner.stop();
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));
    expect(events.some((event) => event.phase === "exited")).toBe(true);
  });

  it("reports a missing npm CLI as a structured failure", async () => {
    const { events, start } = harness();
    const runner = start(null);
    runner.start(sandbox);
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "failed")).toBe(true);
    });
    expect(runner.isRunning()).toBe(false);
  });
});
