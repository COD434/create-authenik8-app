import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

describe("release configuration", () => {
  it("uses a recognized config with the intended release rules and GitHub publisher", async () => {
    const config = await fs.readJson(path.join(repositoryRoot, ".releaserc.json"));

    expect(config.branches).toEqual(["main"]);
    expect(config.plugins[0]).toEqual([
      "@semantic-release/commit-analyzer",
      {
        releaseRules: [
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "chore", release: "patch" },
          { type: "docs", release: "patch" },
          { type: "refactor", release: "patch" },
          { type: "ci", release: "patch" },
        ],
      },
    ]);
    expect(config.plugins).toContain("@semantic-release/github");
  });

  it("pins a semantic-release version on a compatible Node runtime", async () => {
    const workflow = await fs.readFile(
      path.join(repositoryRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("npx --yes semantic-release@25.0.8");
    expect(workflow).not.toMatch(/run: npx semantic-release\s/);
  });
});
