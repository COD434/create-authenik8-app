import path from "node:path";
import { describe, expect, it } from "vitest";

import { projectManifestSchema } from "../../src/lib/projectManifest.js";
import { compareSemanticVersions, parseSemanticVersion } from "../../src/lib/semver.js";
import {
  parseUpgradeArguments,
  upgradeCheckExitCode,
  UpgradeUsageError,
} from "../../src/commands/upgrade/index.js";
import { createUpgradePlan } from "../../src/commands/upgrade/plan.js";
import type { UpgradeContext } from "../../src/commands/upgrade/types.js";

function context(overrides: Partial<UpgradeContext> = {}): UpgradeContext {
  const manifest = projectManifestSchema.parse({
    schemaVersion: 1,
    projectName: "demo-app",
    generatedBy: { package: "create-authenik8-app", version: "2.4.4" },
    engine: { package: "authenik8-core", version: "2.0.3" },
    preset: "auth-oauth",
    packageManager: "npm",
    runtime: "node",
    database: "sqlite",
    features: { prisma: true, oauthProviders: ["google"], pm2: false },
  });
  return {
    rootDir: "/tmp/demo-app",
    appDir: "/tmp/demo-app",
    manifest,
    packageManager: "npm",
    declaredEngineVersion: "2.0.3",
    installedEngineVersion: "2.0.3",
    targetGeneratorVersion: "2.4.4",
    targetEngineVersion: "2.0.3",
    ...overrides,
  };
}

describe("semantic release comparison", () => {
  it("orders stable and prerelease versions without accepting ranges", () => {
    expect(parseSemanticVersion("2.0.3")).toMatchObject({ major: 2, minor: 0, patch: 3 });
    expect(compareSemanticVersions("2.0.3-beta.1", "2.0.3")).toBe("older");
    expect(compareSemanticVersions("2.0.3-beta.10", "2.0.3-beta.2")).toBe("newer");
    expect(compareSemanticVersions("2.1.0", "2.0.3")).toBe("newer");
    expect(compareSemanticVersions("^2.0.3", "2.0.3")).toBe("invalid");
  });
});

describe("upgrade command", () => {
  it("parses read-only and CI options", () => {
    expect(parseUpgradeArguments(["project", "--json", "--check"], "/tmp/work"))
      .toEqual({
        directory: path.resolve("/tmp/work/project"),
        json: true,
        check: true,
        help: false,
      });
    expect(() => parseUpgradeArguments(["--apply"])).toThrow(UpgradeUsageError);
    expect(() => parseUpgradeArguments(["one", "two"])).toThrow("at most one");
  });

  it("returns a clean plan for a release-aligned project", () => {
    const plan = createUpgradePlan(context());
    expect(plan.status).toBe("current");
    expect(plan.actions).toEqual([]);
    expect(upgradeCheckExitCode(plan)).toBe(0);
  });

  it("surfaces the real v2 security migration before an engine command", () => {
    const oldManifest = projectManifestSchema.parse({
      ...context().manifest,
      generatedBy: { package: "create-authenik8-app", version: "1.9.0" },
      engine: { package: "authenik8-core", version: "0.1.2" },
    });
    const plan = createUpgradePlan(context({
      manifest: oldManifest,
      declaredEngineVersion: "0.1.2",
      installedEngineVersion: "0.1.2",
    }));

    expect(plan.status).toBe("upgrade-available");
    expect(plan.actions.map((action) => action.id)).toEqual(expect.arrayContaining([
      "generator.release-review",
      "engine.es256-v2",
      "engine.upgrade",
      "upgrade.verify",
    ]));
    expect(plan.actions.find((action) => action.id === "engine.es256-v2")?.detail)
      .toContain("ES256 P-256 key ring");
    expect(upgradeCheckExitCode(plan)).toBe(1);
  });

  it("blocks manifest drift and attempted downgrades", () => {
    const newerManifest = projectManifestSchema.parse({
      ...context().manifest,
      generatedBy: { package: "create-authenik8-app", version: "3.0.0" },
      engine: { package: "authenik8-core", version: "3.0.0" },
    });
    const plan = createUpgradePlan(context({
      manifest: newerManifest,
      declaredEngineVersion: "2.0.3",
      installedEngineVersion: "2.0.3",
    }));
    expect(plan.status).toBe("blocked");
    expect(plan.actions.map((action) => action.id)).toEqual(expect.arrayContaining([
      "engine.manifest-drift",
      "generator.downgrade",
      "engine.downgrade",
    ]));
  });
});
