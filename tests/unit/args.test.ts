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

  it("parses a complete deterministic generation contract", () => {
    expect(parseCliArguments([
      "demo-app",
      "--yes",
      "--preset=fullstack",
      "--frontend=lovable",
      "--no-oauth",
      "--no-git",
      "--no-install",
    ])).toMatchObject({
      projectName: "demo-app",
      nonInteractive: true,
      preset: "fullstack",
      frontend: "lovable",
      oauthProviders: [],
      useGit: false,
      skipInstall: true,
    });
  });

  it.each([
    [["demo-app", "--unknown"], "Unknown option"],
    [["demo-app", "--package-manager"], "requires npm, pnpm, or bun"],
    [["demo-app", "--package-manager", "yarn"], "Unsupported package manager"],
    [["demo-app", "second-app"], "Only one project name"],
    [["demo-app", "--preset", "base"], "require --non-interactive"],
    [["demo-app", "--yes", "--oauth", "google", "--no-oauth"], "cannot be used together"],
    [["demo-app", "--yes", "--prisma", "--no-prisma"], "cannot be used together"],
    [["demo-app", "--yes", "--preset", "unknown"], "--preset must be"],
    [["demo-app", "--yes", "--resume", "--preset", "base"], "cannot be combined"],
    [["demo-app", "--yes", "--preset", "base", "--preset", "auth"], "only be provided once"],
    [["demo-app", "--yes", "--frontend", "custom"], "--frontend must be react or lovable"],
    [["demo-app", "--frontend", "lovable"], "require --non-interactive"],
  ])("rejects invalid arguments %#", (argv, message) => {
    expect(() => parseCliArguments(argv)).toThrow(message);
  });
});
