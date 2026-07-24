import { describe, expect, it } from "vitest";

import { parseCliArguments } from "../../src/lib/args.js";
import { resolveNonInteractiveAnswers } from "../../src/lib/nonInteractive.js";

function resolve(args: string[], bunAvailable = false) {
  return resolveNonInteractiveAnswers(parseCliArguments(["demo-app", "--yes", ...args]), {
    bunAvailable,
  });
}

describe("non-interactive generation", () => {
  it("resolves the database-free base preset without inferred auth features", () => {
    expect(resolve(["--preset", "base", "--no-prisma", "--no-git"])).toEqual({
      framework: "Express",
      authMode: "base",
      usePrisma: false,
      useGit: false,
    });
  });

  it("resolves selected OAuth providers and production runtime", () => {
    expect(resolve([
      "--preset",
      "auth-oauth",
      "--database",
      "postgresql",
      "--oauth",
      "github",
      "--production-ready",
      "--runtime",
      "bun",
      "--git",
    ], true)).toMatchObject({
      authMode: "auth-oauth",
      usePrisma: true,
      database: "postgresql",
      oauthProviders: ["github"],
      runtime: "bun",
      useGit: true,
    });
  });

  it("normalizes the fixed fullstack contract while allowing OAuth to be disabled", () => {
    expect(resolve(["--preset", "fullstack", "--no-oauth"])).toMatchObject({
      authMode: "fullstack",
      authMethods: ["password"],
      oauthProviders: [],
      usePrisma: true,
      database: "postgresql",
      runtime: "node",
      useGit: false,
    });
  });

  it.each([
    [["--preset", "base"], "requires --prisma or --no-prisma"],
    [["--preset", "base", "--prisma"], "requires --database"],
    [["--preset", "auth", "--database", "sqlite", "--oauth", "google"], "only applies"],
    [["--preset", "auth-oauth", "--database", "sqlite", "--no-oauth"], "requires --oauth"],
    [["--preset", "fullstack"], "requires --oauth"],
    [["--preset", "fullstack", "--no-oauth", "--database", "sqlite"], "requires PostgreSQL"],
    [["--preset", "auth", "--database", "sqlite", "--runtime", "node"], "requires --production-ready"],
    [["--preset", "auth", "--database", "sqlite", "--production-ready", "--runtime", "bun"], "not available"],
  ])("rejects incomplete or contradictory configuration %#", (args, message) => {
    expect(() => resolve(args)).toThrow(message);
  });
});
