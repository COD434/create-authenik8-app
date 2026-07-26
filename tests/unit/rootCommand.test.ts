import { describe, expect, it } from "vitest";

import { resolveRootCommand } from "../../src/lib/rootCommand.js";

describe("resolveRootCommand", () => {
  it("preserves the legacy create syntax", () => {
    expect(resolveRootCommand(["demo-app", "--no-install"])).toEqual({
      name: "create",
      args: ["demo-app", "--no-install"],
    });
  });

  it("supports an explicit create command", () => {
    expect(resolveRootCommand(["create", "doctor", "--no-install"])).toEqual({
      name: "create",
      args: ["doctor", "--no-install"],
    });
  });

  it("routes doctor arguments without exposing them to the generator", () => {
    expect(resolveRootCommand(["doctor", "./app", "--json"])).toEqual({
      name: "doctor",
      args: ["./app", "--json"],
    });
  });

  it("routes add recipes without exposing them to the generator", () => {
    expect(resolveRootCommand(["add", "oauth-github", "./app", "--dry-run"])).toEqual({
      name: "add",
      args: ["oauth-github", "./app", "--dry-run"],
    });
  });

  it("routes upgrade checks without exposing them to the generator", () => {
    expect(resolveRootCommand(["upgrade", "./app", "--check", "--json"])).toEqual({
      name: "upgrade",
      args: ["./app", "--check", "--json"],
    });
  });
});
