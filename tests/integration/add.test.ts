import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { formatAddDiff } from "../../src/commands/add/diff.js";
import { runAdd } from "../../src/commands/add/index.js";
import { AddRecipeError } from "../../src/commands/add/plan.js";
import { githubCiWorkflowPath } from "../../src/commands/add/ci.js";
import { runDoctor } from "../../src/commands/doctor/index.js";
import {
  generateProjectFixture,
  installGeneratedAppStubs,
  runGeneratedServerSmoke,
} from "../helpers/generator.js";

async function sources(rootDir: string, relativePaths: readonly string[]): Promise<string[]> {
  return Promise.all(relativePaths.map((relativePath) =>
    fs.readFile(path.join(rootDir, relativePath), "utf8")
  ));
}

describe("built-in add recipes", () => {
  it("previews, applies, verifies, diagnoses, and then no-ops an Express provider", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    const managed = [
      ".env",
      ".env.example",
      "authenik8.json",
      "src/auth/auth.ts",
      "src/auth/controllers/oauth.controller.ts",
      "src/auth/routes/oauth.routes.ts",
    ];
    try {
      const before = await sources(project.targetDir, managed);
      const preview = await runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: true,
        list: false,
        help: false,
      });
      expect(preview.status).toBe("preview");
      expect(await sources(project.targetDir, managed)).toEqual(before);
      const diff = formatAddDiff(preview.changes);
      expect(diff).toContain('router.get("/github/callback"');
      expect(diff).toContain("GITHUB_CLIENT_SECRET=<redacted>");
      expect(diff).not.toContain('"d":');

      const applied = await runAdd({
        recipeName: "github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(applied.status).toBe("applied");
      expect(await fs.readFile(path.join(project.targetDir, "src/auth/routes/oauth.routes.ts"), "utf8"))
        .toContain('router.get("/github/link"');
      expect((await fs.readJson(path.join(project.targetDir, "authenik8.json"))).features.oauthProviders)
        .toEqual(["google", "github"]);

      const smoke = await runGeneratedServerSmoke(project.targetDir, "src/server.ts");
      expect(smoke).toMatchObject({ code: 0, stderr: "" });
      await fs.remove(path.join(project.targetDir, "node_modules/authenik8-core"));
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );
      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "project.manifest")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "oauth.github")?.status).toBe("warn");

      const repeated = await runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(repeated.status).toBe("unchanged");
    } finally {
      await project.cleanup();
    }
  });

  it("wires a fullstack provider registry without rewriting backend auth code", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      oauthProviders: ["github"],
    });
    try {
      const backendPath = path.join(project.targetDir, "apps/api/src/auth/authenik8.ts");
      const backendBefore = await fs.readFile(backendPath, "utf8");
      const result = await runAdd({
        recipeName: "oauth-google",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });

      expect(result.status).toBe("applied");
      expect(await fs.readFile(backendPath, "utf8")).toBe(backendBefore);
      expect(await fs.readFile(
        path.join(project.targetDir, "apps/web/src/auth/providers.ts"),
        "utf8",
      )).toContain('["google","github"]');
      expect(await fs.readFile(path.join(project.targetDir, ".env"), "utf8"))
        .toContain("GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback");

      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );
      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "oauth.google")?.status).toBe("warn");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses to overwrite locally modified generated auth code", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      const authPath = path.join(project.targetDir, "src/auth/auth.ts");
      await fs.appendFile(authPath, "// local policy\n");
      const manifestBefore = await fs.readFile(path.join(project.targetDir, "authenik8.json"), "utf8");

      await expect(runAdd({
        recipeName: "oauth-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      })).rejects.toBeInstanceOf(AddRecipeError);
      expect(await fs.readFile(path.join(project.targetDir, "authenik8.json"), "utf8"))
        .toBe(manifestBefore);
      expect(await fs.readFile(authPath, "utf8")).toContain("// local policy");
    } finally {
      await project.cleanup();
    }
  });

  it("previews, creates, verifies, and protects the GitHub CI recipe", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    const workflowPath = path.join(project.targetDir, githubCiWorkflowPath);
    try {
      await expect(runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: true,
        list: false,
        help: false,
      })).rejects.toThrow("requires a committed npm lockfile");
      expect(await fs.pathExists(workflowPath)).toBe(false);

      await fs.writeJson(path.join(project.targetDir, "package-lock.json"), {
        name: "generated-app",
        lockfileVersion: 3,
        packages: {},
      });
      const preview = await runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: true,
        list: false,
        help: false,
      });
      expect(preview.status).toBe("preview");
      expect(preview.changes).toMatchObject([{
        relativePath: githubCiWorkflowPath,
        before: null,
      }]);
      expect(formatAddDiff(preview.changes)).toContain("--- /dev/null");
      expect(await fs.pathExists(workflowPath)).toBe(false);

      const applied = await runAdd({
        recipeName: "github-ci",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(applied.status).toBe("applied");
      const workflow = await fs.readFile(workflowPath, "utf8");
      expect(workflow).toContain("doctor --json --skip-services");
      expect(workflow).toContain("upgrade --check --json");
      expect(workflow).toContain("npm ci --no-audit --no-fund");
      expect([...workflow.matchAll(/uses: [^@]+@([0-9a-f]+)/g)].map((match) => match[1]))
        .toEqual([expect.stringMatching(/^[0-9a-f]{40}$/), expect.stringMatching(/^[0-9a-f]{40}$/)]);

      const repeated = await runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      });
      expect(repeated.status).toBe("unchanged");

      await fs.appendFile(workflowPath, "# local policy\n");
      await expect(runAdd({
        recipeName: "ci-github",
        directory: project.targetDir,
        dryRun: false,
        list: false,
        help: false,
      })).rejects.toBeInstanceOf(AddRecipeError);
      expect(await fs.readFile(workflowPath, "utf8")).toContain("# local policy");
    } finally {
      await project.cleanup();
    }
  });
});
