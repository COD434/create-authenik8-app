import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { runUpgrade } from "../../src/commands/upgrade/index.js";
import { acknowledgeUpgrade } from "../../src/commands/upgrade/acknowledge.js";
import { formatUpgradePlan } from "../../src/commands/upgrade/output.js";
import {
  generateProjectFixture,
  installGeneratedAppStubs,
} from "../helpers/generator.js";

describe("generated project upgrade plans", () => {
  it("reports a generated project as release-aligned against the real engine", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
      const plan = await runUpgrade({
        directory: project.targetDir,
        json: true,
        check: true,
        acknowledge: false,
        help: false,
      });

      expect(plan.status).toBe("current");
      expect(plan.versions).toMatchObject({
        generator: { project: "2.4.4", target: "2.4.4" },
        engine: {
          manifest: "2.0.7",
          declared: "2.0.7",
          installed: "2.0.7",
          target: "2.0.7",
        },
      });
      expect(formatUpgradePlan(plan, true)).not.toMatch(/secret|"d"\s*:/i);
    } finally {
      await project.cleanup();
    }
  });

  it("turns generator drift into a deterministic CI failure plan", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      const manifestPath = path.join(project.targetDir, "authenik8.json");
      const manifest = await fs.readJson(manifestPath);
      await fs.writeJson(manifestPath, {
        ...manifest,
        generatedBy: { ...manifest.generatedBy, version: "2.3.0" },
      }, { spaces: 2 });
      const plan = await runUpgrade({
        directory: project.targetDir,
        json: true,
        check: true,
        acknowledge: false,
        help: false,
      });

      expect(plan.status).toBe("upgrade-available");
      expect(plan.actions.find((action) => action.id === "generator.release-review"))
        .toMatchObject({ kind: "required" });
      expect(JSON.parse(formatUpgradePlan(plan, true))).toEqual(plan);
    } finally {
      await project.cleanup();
    }
  });

  it("acknowledges exact installed releases by changing only manifest metadata", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
      const manifestPath = path.join(project.targetDir, "authenik8.json");
      const before = await fs.readJson(manifestPath);
      await fs.writeJson(manifestPath, {
        ...before,
        generatedBy: { ...before.generatedBy, version: "2.3.0" },
        engine: { ...before.engine, version: "2.0.3" },
      }, { spaces: 2 });

      const result = await acknowledgeUpgrade(project.targetDir);
      const after = await fs.readJson(manifestPath);
      expect(result).toMatchObject({
        status: "acknowledged",
        previous: { generator: "2.3.0", engine: "2.0.3" },
        current: { generator: "2.4.4", engine: "2.0.7" },
      });
      expect(after).toEqual({
        ...before,
        generatedBy: { ...before.generatedBy, version: "2.4.4" },
        engine: { ...before.engine, version: "2.0.7" },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("leaves release metadata unchanged when deep verification cannot run", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const manifestPath = path.join(project.targetDir, "authenik8.json");
      const before = await fs.readJson(manifestPath);
      await fs.writeJson(manifestPath, {
        ...before,
        generatedBy: { ...before.generatedBy, version: "2.3.0" },
        engine: { ...before.engine, version: "2.0.3" },
      }, { spaces: 2 });

      await expect(acknowledgeUpgrade(project.targetDir))
        .rejects.toThrow("passing deep Doctor verification");
      expect(await fs.readJson(manifestPath)).toEqual({
        ...before,
        generatedBy: { ...before.generatedBy, version: "2.3.0" },
        engine: { ...before.engine, version: "2.0.3" },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("refuses acknowledgement for ranges, installation drift, and downgrades", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const packagePath = path.join(project.targetDir, "package.json");
      const manifestPath = path.join(project.targetDir, "authenik8.json");
      const pkg = await fs.readJson(packagePath);
      const manifest = await fs.readJson(manifestPath);

      await fs.writeJson(packagePath, {
        ...pkg,
        dependencies: {
          ...pkg.dependencies,
          "authenik8-core": "^2.0.7",
        },
      });
      await expect(acknowledgeUpgrade(project.targetDir))
        .rejects.toThrow("exact authenik8-core version");

      await fs.writeJson(packagePath, pkg);
      await fs.writeJson(manifestPath, {
        ...manifest,
        engine: { ...manifest.engine, version: "3.0.0" },
      });
      await expect(acknowledgeUpgrade(project.targetDir))
        .rejects.toThrow("downgrade");
      expect((await fs.readJson(manifestPath)).engine.version).toBe("3.0.0");

      await fs.writeJson(manifestPath, manifest);
      await fs.remove(path.join(project.targetDir, "node_modules/authenik8-core"));
      await expect(acknowledgeUpgrade(project.targetDir))
        .rejects.toThrow("Install the declared");
    } finally {
      await project.cleanup();
    }
  });
});
