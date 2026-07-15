import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";

import { initState, loadState, saveState } from "../../src/lib/state.js";
import { configuredCliStateSchema } from "../../src/lib/schemas.js";

const tempDirectories: string[] = [];

function temporaryStateFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "authenik8-state-"));
  tempDirectories.push(directory);
  return path.join(directory, "state.json");
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.removeSync(directory);
  }
});

describe("CLI state validation", () => {
  it("round-trips a valid state through Zod", () => {
    const file = temporaryStateFile();
    initState({ step: "start", projectName: "valid-app" }, file);
    saveState({ packageManager: "pnpm", database: "sqlite" });

    expect(loadState(file)).toMatchObject({
      step: "start",
      projectName: "valid-app",
      packageManager: "pnpm",
      database: "sqlite",
    });
  });

  it("rejects a tampered resume file before generation", () => {
    const file = temporaryStateFile();
    fs.writeJsonSync(file, {
      step: "prompts",
      projectName: "../../outside",
      packageManager: "yarn",
    });

    expect(() => loadState(file)).toThrow("Saved setup state is invalid: projectName:");
  });

  it("rejects invalid internal state updates", () => {
    const file = temporaryStateFile();
    initState({ step: "start", projectName: "valid-app" }, file);

    expect(() => saveState({ database: "mysql" } as never)).toThrow(
      "Invalid CLI state: database:",
    );
  });

  it("rejects incomplete or inconsistent configured presets", () => {
    const result = configuredCliStateSchema.safeParse({
      step: "prompts",
      projectName: "valid-app",
      framework: "Express",
      authMode: "fullstack",
      authMethods: ["google", "github"],
      usePrisma: true,
      useGit: true,
      database: "sqlite",
      runtime: "bun",
      packageManager: "npm",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "database",
        "runtime",
        "authMethods",
      ]);
    }
  });
});
