import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import { runUpgrade } from "../../src/commands/upgrade/index.js";
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
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const plan = await runUpgrade({
        directory: project.targetDir,
        json: true,
        check: true,
        help: false,
      });

      expect(plan.status).toBe("current");
      expect(plan.versions).toMatchObject({
        generator: { project: "2.4.4", target: "2.4.4" },
        engine: {
          manifest: "2.0.3",
          declared: "2.0.3",
          installed: "2.0.3",
          target: "2.0.3",
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
});
