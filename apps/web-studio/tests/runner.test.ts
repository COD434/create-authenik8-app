import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRunner,
  npmRunCommands,
  type RunnerCommands,
  type RunnerEvent,
  type RunnerPhase,
  type RunnerStep,
} from "../src/runner.js";

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
  const runner = createRunner({
    onEvent: (event) => events.push(event),
    onOutput: (line) => output.push(line),
  });
  const start = (commands: RunnerCommands) => runner.start(sandbox, commands);
  return { events, output, runner, start };
}

function steps(...parts: Array<[RunnerPhase, ReadonlyArray<string>]>): RunnerCommands {
  return { steps: parts.map(([phase, argv]): RunnerStep => ({ phase, argv })) };
}

describe("createRunner", () => {
  it("runs every step in order, then serves, streaming output lines", async () => {
    const { events, output, runner, start } = harness();
    await writeFile(path.join(sandbox, "package.json"), "{}", "utf8");
    const commands = steps(
      ["install", [node, "-e", "console.log('installing'); require('fs').writeFileSync('installed.txt', 'yes')"]],
      ["build", [node, "-e", "console.log('building')"]],
      ["serve", [node, "-e", "console.log('serving'); let i = 0; const t = setInterval(() => { console.log('tick'); if (++i > 20) process.exit(0); }, 50);"]],
    );

    expect(start(commands)).toBe(true);
    expect(runner.isRunning()).toBe(true);

    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "install")).toBe(true);
      expect(output).toContain("installing");
      expect(events.some((event) => event.phase === "build")).toBe(true);
      expect(output).toContain("building");
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

  it("serves directly when handed serve-only commands", async () => {
    const { events, output, start } = harness();
    const commands = steps(["serve", [node, "-e", "console.log('serving static'); setTimeout(() => process.exit(0), 100);"]]);

    start(commands);
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "serve")).toBe(true);
      expect(output).toContain("serving static");
      expect(events.some((event) => event.phase === "exited" && event.code === 0)).toBe(true);
    });
    expect(events.some((event) => event.phase === "failed")).toBe(false);
  });

  it("reports an early-step failure as data and never serves", async () => {
    const { events, output, start } = harness();
    const commands = steps(
      ["install", [node, "-e", "console.error('boom'); process.exit(3)"]],
      ["build", [node, "-e", "console.log('should not build')"]],
      ["serve", [node, "-e", "console.log('should not run')"]],
    );

    start(commands);
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "failed" && event.code === 3)).toBe(true);
    });
    expect(output).not.toContain("should not build");
    expect(output).not.toContain("should not run");
  });

  it("refuses a second start while running", async () => {
    const { events, runner, start } = harness();
    const commands = steps(
      ["install", [node, "-e", "process.exit(0)"]],
      ["serve", [node, "-e", "console.log('up'); setTimeout(() => process.exit(0), 300);"]],
    );

    expect(start(commands)).toBe(true);
    expect(start(commands)).toBe(false);
    runner.stop();
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));
    expect(events.some((event) => event.phase === "exited")).toBe(true);
  });

  it("reports a missing npm CLI as a structured failure", async () => {
    const { events, runner, start } = harness();
    start(null);
    await vi.waitFor(() => {
      expect(events.some((event) => event.phase === "failed")).toBe(true);
    });
    expect(runner.isRunning()).toBe(false);
  });
});

describe("npmRunCommands", () => {
  it("composes install plus serve for a manifest without a build need", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ scripts: { start: "node server.js" } }),
      "utf8",
    );
    await writeFile(path.join(sandbox, "server.js"), "", "utf8");

    const commands = await npmRunCommands(sandbox);
    expect(commands).not.toBeNull();
    expect(commands!.steps.map((step) => step.phase)).toEqual(["install", "serve"]);
  });

  it("inserts npm run build only when the start entry is declared and missing", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ scripts: { build: "tsc", start: "node dist/server.js" } }),
      "utf8",
    );

    const commands = await npmRunCommands(sandbox);
    expect(commands!.steps.map((step) => step.phase)).toEqual(["install", "build", "serve"]);
    expect(commands!.steps[1]!.argv.slice(-2)).toEqual(["run", "build"]);
  });

  it("does not insert a build when the start entry already exists", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ scripts: { build: "tsc", start: "node dist/server.js" } }),
      "utf8",
    );
    await mkdir(path.join(sandbox, "dist"), { recursive: true });
    await writeFile(path.join(sandbox, "dist", "server.js"), "", "utf8");

    const commands = await npmRunCommands(sandbox);
    expect(commands!.steps.map((step) => step.phase)).toEqual(["install", "serve"]);
  });

  it("serves only when the sandbox has no manifest", async () => {
    const commands = await npmRunCommands(sandbox);
    expect(commands!.steps.map((step) => step.phase)).toEqual(["serve"]);
  });
});
