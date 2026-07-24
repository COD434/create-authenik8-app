import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import {
  AddUsageError,
  parseAddArguments,
} from "../../src/commands/add/index.js";
import { formatFileDiff } from "../../src/commands/add/diff.js";
import { addRecipes, findAddRecipe } from "../../src/commands/add/registry.js";
import { applyPlannedChanges } from "../../src/commands/add/apply.js";
import { renderGithubCiWorkflow } from "../../src/commands/add/ci.js";

describe("add command", () => {
  it("parses a recipe, directory, and both preview spellings", () => {
    expect(parseAddArguments(["oauth-github", "project", "--diff"], "/tmp/work"))
      .toEqual({
        recipeName: "oauth-github",
        directory: path.resolve("/tmp/work/project"),
        dryRun: true,
        list: false,
        help: false,
      });
    expect(parseAddArguments(["google", "--dry-run"], "/tmp/work").dryRun).toBe(true);
  });

  it("rejects unknown options, missing recipes, and excess positional input", () => {
    expect(() => parseAddArguments(["--write"])).toThrow(AddUsageError);
    expect(() => parseAddArguments([])).toThrow("requires a recipe");
    expect(() => parseAddArguments(["google", "one", "two"])).toThrow("at most one");
  });

  it("uses a closed, typed registry with stable aliases", () => {
    expect(addRecipes.map((recipe) => recipe.id)).toEqual([
      "oauth-google",
      "oauth-github",
      "ci-github",
    ]);
    expect(new Set(addRecipes.map((recipe) => recipe.id)).size).toBe(addRecipes.length);
    expect(findAddRecipe("github")?.id).toBe("oauth-github");
    expect(Object.isFrozen(addRecipes)).toBe(true);
  });

  it("renders locked package-manager setup in the CI recipe", () => {
    expect(renderGithubCiWorkflow("npm", "2.4.4")).toContain("npm ci --no-audit --no-fund");
    expect(renderGithubCiWorkflow("pnpm", "2.4.4")).toContain(
      "npm install --global pnpm@10.12.1",
    );
    expect(renderGithubCiWorkflow("bun", "2.4.4")).toContain(
      "npm install --global bun@1.3.14",
    );
  });

  it("never prints existing environment secrets as diff context", () => {
    const diff = formatFileDiff({
      relativePath: ".env",
      before: "REFRESH_SECRET=a-real-secret-that-must-not-leak\n",
      after: [
        "REFRESH_SECRET=a-real-secret-that-must-not-leak",
        "GITHUB_CLIENT_ID=real-client-id",
        "GITHUB_CLIENT_SECRET=real-client-secret",
        "GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback",
        "",
      ].join("\n"),
      sensitive: true,
    });

    expect(diff).not.toContain("a-real-secret-that-must-not-leak");
    expect(diff).not.toContain("real-client-id");
    expect(diff).not.toContain("real-client-secret");
    expect(diff).toContain("GITHUB_CLIENT_SECRET=<redacted>");
    expect(diff).toContain("http://localhost:3000/auth/github/callback");
  });

  it("rolls every file back when post-apply verification fails", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-add-rollback-"));
    const publicPath = path.join(directory, "providers.ts");
    const envPath = path.join(directory, ".env");
    await fs.writeFile(publicPath, "export const providers = [];\n");
    await fs.writeFile(envPath, "REFRESH_SECRET=existing-secret\n");

    try {
      await expect(applyPlannedChanges(directory, [
        {
          relativePath: "providers.ts",
          before: "export const providers = [];\n",
          after: 'export const providers = ["github"];\n',
        },
        {
          relativePath: ".env",
          before: "REFRESH_SECRET=existing-secret\n",
          after: "REFRESH_SECRET=existing-secret\nGITHUB_CLIENT_ID=\n",
          sensitive: true,
        },
      ], async () => {
        throw new Error("verification failed");
      })).rejects.toThrow("verification failed");

      expect(await fs.readFile(publicPath, "utf8")).toBe("export const providers = [];\n");
      expect(await fs.readFile(envPath, "utf8")).toBe("REFRESH_SECRET=existing-secret\n");
      expect((await fs.readdir(directory)).some((name) => name.includes(".authenik8-")))
        .toBe(false);
    } finally {
      await fs.remove(directory);
    }
  });

  it("removes a newly created recipe file and directories during rollback", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-add-new-rollback-"));
    try {
      await expect(applyPlannedChanges(directory, [{
        relativePath: ".github/workflows/authenik8.yml",
        before: null,
        after: "name: Authenik8\n",
      }], async () => {
        throw new Error("verification failed");
      })).rejects.toThrow("verification failed");
      expect(await fs.pathExists(path.join(directory, ".github"))).toBe(false);
    } finally {
      await fs.remove(directory);
    }
  });

  it("rejects recipe targets that escape through a symlink", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-add-symlink-"));
    const external = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-add-external-"));
    try {
      await fs.ensureSymlink(external, path.join(directory, ".github"), "dir");
      await expect(applyPlannedChanges(directory, [{
        relativePath: ".github/workflows/authenik8.yml",
        before: null,
        after: "name: Authenik8\n",
      }], async () => {})).rejects.toThrow("resolves outside");
      expect(await fs.pathExists(path.join(external, "workflows/authenik8.yml"))).toBe(false);
    } finally {
      await fs.remove(directory);
      await fs.remove(external);
    }
  });
});
