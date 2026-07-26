import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";

import { runDoctor } from "../../src/commands/doctor/index.js";
import { formatDoctorReport } from "../../src/commands/doctor/output.js";
import { createDoctorContext } from "../../src/commands/doctor/context.js";
import { runPostGenerationDoctor } from "../../src/commands/doctor/postGeneration.js";
import {
  generateProjectFixture,
  installGeneratedAppStubs,
} from "../helpers/generator.js";

describe("generated project doctor", () => {
  it("runs the post-generation static boundary without requiring skipped dependencies", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      const result = await runPostGenerationDoctor(project.targetDir, false);

      expect(result.passed).toBeGreaterThan(0);
      expect(result.warningLabels).toContain("Identity engine");
      expect(result.warningLabels).not.toContain("Redis");
    } finally {
      await project.cleanup();
    }
  });

  it("fails the post-generation boundary when signing configuration drifts", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      const envPath = path.join(project.targetDir, ".env");
      const source = await fs.readFile(envPath, "utf8");
      await fs.writeFile(
        envPath,
        source.replace(
          /^AUTHENIK8_ACTIVE_KID=.*$/m,
          "AUTHENIK8_ACTIVE_KID=missing-key",
        ),
      );

      await expect(runPostGenerationDoctor(project.targetDir, false)).rejects.toThrow(
        "Signing key ring",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("requires the reliable setup path and migration baseline for fullstack projects", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });
    try {
      const packagePath = path.join(project.targetDir, "package.json");
      const pkg = await fs.readJson(packagePath);
      delete pkg.scripts.setup;
      await fs.writeJson(packagePath, pkg);
      await fs.remove(path.join(
        project.targetDir,
        "apps/api/prisma/migrations/migration_lock.toml",
      ));

      await expect(runPostGenerationDoctor(project.targetDir, false)).rejects.toThrow(
        /Project structure|Project scripts/,
      );
    } finally {
      await project.cleanup();
    }
  });

  it("passes a generated project through the real auth checks and local Redis boundary", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
      packageManager: "pnpm",
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      expect((await createDoctorContext(project.targetDir)).packageManager).toBe("pnpm");
      let probed = false;
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async (endpoint) => {
          probed = true;
          expect(endpoint).toMatchObject({ host: "127.0.0.1", port: 6379, tls: false });
        } },
      );

      expect(probed).toBe(false);
      expect(report.preset).toBe("base");
      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "auth.signing")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "dependency.core")?.message).toContain("2.0.3");
      expect(report.checks.find((check) => check.id === "project.manifest")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "service.redis")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "service.redis")?.message).toContain(
        "In-process Redis",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("returns machine-readable output with CI-safe service skipping", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const result = await runDoctor({
        directory: project.targetDir,
        json: true,
        skipServices: true,
      });
      const report = JSON.parse(formatDoctorReport(result, true)) as Awaited<ReturnType<typeof runDoctor>>;
      expect(report.summary.failed).toBe(0);
      expect(report.summary.warnings).toBe(1);
      expect(report.checks.at(-1)).toMatchObject({ id: "service.redis", status: "warn" });
    } finally {
      await project.cleanup();
    }
  });

  it("accepts the Docker-free local Redis configuration without a network probe", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });
    try {
      let probed = false;
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        {
          allowMissingCore: true,
          redisProbe: async () => { probed = true; },
        },
      );

      expect(probed).toBe(false);
      expect(report.checks.find((check) => check.id === "service.redis")).toMatchObject({
        status: "pass",
        message: "In-process Redis will initialize with the API process",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("warns when a generated OAuth provider still has placeholder credentials", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );

      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "oauth.google")).toMatchObject({
        status: "warn",
      });
      expect(report.checks.some((check) => check.id === "oauth.github")).toBe(false);
    } finally {
      await project.cleanup();
    }
  });

  it("fails closed when the active signing key no longer matches the generated key ring", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const envPath = path.join(project.targetDir, ".env");
      const source = await fs.readFile(envPath, "utf8");
      await fs.writeFile(envPath, source.replace(/^AUTHENIK8_ACTIVE_KID=.*$/m, "AUTHENIK8_ACTIVE_KID=missing-key"));

      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );

      expect(report.summary.failed).toBeGreaterThan(0);
      expect(report.checks.find((check) => check.id === "auth.signing")).toMatchObject({
        status: "fail",
      });
      expect(JSON.stringify(report)).not.toContain('"d":');
    } finally {
      await project.cleanup();
    }
  });

  it("keeps structural diagnostics available for projects created before manifests", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      await fs.remove(path.join(project.targetDir, "authenik8.json"));
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );

      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "project.manifest")).toMatchObject({
        status: "warn",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("reports architecture drift between the manifest and generated files", async () => {
    const project = await generateProjectFixture({ template: "base", usePrisma: true });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const manifestPath = path.join(project.targetDir, "authenik8.json");
      const manifest = await fs.readJson(manifestPath);
      await fs.writeJson(manifestPath, { ...manifest, preset: "auth" }, { spaces: 2 });
      const report = await runDoctor(
        { directory: project.targetDir, json: false, skipServices: false },
        { redisProbe: async () => {} },
      );

      expect(report.checks.find((check) => check.id === "project.manifest")).toMatchObject({
        status: "fail",
      });
    } finally {
      await project.cleanup();
    }
  });
});
