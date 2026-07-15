import { describe, expect, it } from "vitest";

import { parseCliArguments } from "../../src/lib/args.js";

describe("CLI argument parsing", () => {
  it("parses flags before and after the project name", () => {
    expect(parseCliArguments([
      "--production-ready",
      "demo-app",
      "--package-manager",
      "pnpm",
      "--no-install",
    ])).toMatchObject({
      projectName: "demo-app",
      productionReady: true,
      packageManager: "pnpm",
      skipInstall: true,
    });
  });

  it("supports equals syntax and short informational flags", () => {
    expect(parseCliArguments(["demo-app", "--package-manager=bun", "-v", "-h"]))
      .toMatchObject({
        projectName: "demo-app",
        packageManager: "bun",
        version: true,
        help: true,
      });
  });

  it.each([
    [["demo-app", "--unknown"], "Unknown option"],
    [["demo-app", "--package-manager"], "requires npm, pnpm, or bun"],
    [["demo-app", "--package-manager", "yarn"], "Unsupported package manager"],
    [["demo-app", "second-app"], "Only one project name"],
  ])("rejects invalid arguments %#", (argv, message) => {
    expect(() => parseCliArguments(argv)).toThrow(message);
  });
});
