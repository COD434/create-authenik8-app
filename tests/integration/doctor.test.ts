import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import path from "node:path";

import {
  doctorExitCode,
  runDoctor,
} from "../../src/commands/doctor/index.js";
import { formatDoctorReport } from "../../src/commands/doctor/output.js";
import { createDoctorContext } from "../../src/commands/doctor/context.js";
import { runPostGenerationDoctor } from "../../src/commands/doctor/postGeneration.js";
import { writeDoctorSupportReport } from "../../src/commands/doctor/report.js";
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
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
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
      expect(report.checks.find((check) => check.id === "A8-JWK-006")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "A8-CORE-001")?.message).toContain("2.0.7");
      expect(report.checks.find((check) => check.id === "A8-PROJECT-002")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "A8-REDIS-002")?.status).toBe("pass");
      expect(report.checks.find((check) => check.id === "A8-REDIS-002")?.message).toContain(
        "In-process Redis",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("detects the nearest generated project from a nested working directory", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const nestedDirectory = path.join(project.targetDir, "src", "nested");
      await fs.ensureDir(nestedDirectory);

      const context = await createDoctorContext(nestedDirectory);
      const report = await runDoctor(
        {
          directory: nestedDirectory,
          json: false,
          skipServices: false,
        },
        { redisProbe: async () => {} },
      );

      expect(context.rootDir).toBe(project.targetDir);
      expect(report.rootDir).toBe(project.targetDir);
      expect(report.summary.failed).toBe(0);
    } finally {
      await project.cleanup();
    }
  });

  it("detects a fullstack root instead of treating its API workspace as an Express project", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });
    try {
      const context = await createDoctorContext(
        path.join(project.targetDir, "apps/api/src"),
      );

      expect(context.rootDir).toBe(project.targetDir);
      expect(context.preset).toBe("fullstack");
    } finally {
      await project.cleanup();
    }
  });

  it("does not open unrelated service connections for a targeted diagnostic", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      let probed = false;
      const report = await runDoctor(
        {
          directory: project.targetDir,
          json: false,
          skipServices: false,
          checkId: "A8-JWK-006",
        },
        { redisProbe: async () => { probed = true; } },
      );

      expect(probed).toBe(false);
      expect(report.checks.map((check) => check.id)).toEqual([
        "A8-PROJECT-001",
        "A8-ENV-002",
        "A8-JWK-006",
      ]);
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
      expect(report.checks.at(-1)).toMatchObject({ id: "A8-REDIS-002", status: "warn" });
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
      expect(report.checks.find((check) => check.id === "A8-REDIS-002")).toMatchObject({
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
      expect(report.checks.find((check) => check.id === "A8-OAUTH-002")).toMatchObject({
        status: "warn",
      });
      expect(report.checks.some((check) => check.id === "A8-OAUTH-003")).toBe(false);
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
      expect(report.checks.find((check) => check.id === "A8-JWK-006")).toMatchObject({
        status: "fail",
        impact: expect.any(String),
        remediation: expect.any(String),
        verification: expect.stringContaining("--check A8-JWK-006"),
      });
      expect(JSON.stringify(report)).not.toContain('"d":');
    } finally {
      await project.cleanup();
    }
  });

  it("skips dependent checks after an invalid environment prerequisite", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      await fs.writeFile(path.join(project.targetDir, ".env"), "INVALID LINE\n");

      const report = await runDoctor({
        directory: project.targetDir,
        json: false,
        skipServices: true,
      });

      expect(report.checks.find((check) => check.id === "A8-ENV-002"))
        .toMatchObject({ status: "fail" });
      expect(report.checks.find((check) => check.id === "A8-JWK-006"))
        .toMatchObject({
          status: "skip",
          message: expect.stringContaining("A8-ENV-002"),
        });
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
      expect(report.checks.find((check) => check.id === "A8-PROJECT-002")).toMatchObject({
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

      expect(report.checks.find((check) => check.id === "A8-PROJECT-002")).toMatchObject({
        status: "fail",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("validates a clean checkout from .env.example without writing synthetic secrets", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      oauthProviders: ["google"],
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const envPath = path.join(project.targetDir, ".env");
      await fs.remove(envPath);

      const report = await runDoctor({
        directory: project.targetDir,
        json: false,
        skipServices: false,
        offline: true,
        ci: true,
        strict: true,
      });

      expect(report.mode).toBe("offline");
      expect(report.summary.failed).toBe(0);
      expect(report.summary.warnings).toBe(0);
      expect(report.checks.find((check) => check.id === "A8-JWK-006"))
        .toMatchObject({ status: "pass" });
      expect(report.checks.find((check) => check.id === "A8-OAUTH-002"))
        .toMatchObject({ status: "pass" });
      expect(report.checks.find((check) => check.id === "A8-REDIS-002"))
        .toMatchObject({ status: "skip" });
      expect(doctorExitCode(report, true)).toBe(0);
      expect(await fs.pathExists(envPath)).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(/"d"\s*:/);
    } finally {
      await project.cleanup();
    }
  });

  it("does not execute project dependency code in offline mode", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      const coreDirectory = path.join(
        project.targetDir,
        "node_modules/authenik8-core",
      );
      await fs.ensureDir(coreDirectory);
      await fs.writeJson(path.join(coreDirectory, "package.json"), {
        name: "authenik8-core",
        version: "2.0.7",
        main: "index.js",
      });
      await fs.writeFile(
        path.join(coreDirectory, "index.js"),
        'throw new Error("project dependency code executed");\n',
      );
      await fs.remove(path.join(project.targetDir, ".env"));

      const report = await runDoctor({
        directory: project.targetDir,
        json: false,
        skipServices: false,
        offline: true,
      });

      expect(report.summary.failed).toBe(0);
      expect(report.checks.find((check) => check.id === "A8-JWK-006"))
        .toMatchObject({
          status: "pass",
          message: expect.stringContaining(
            "did not load project dependency code",
          ),
        });
    } finally {
      await project.cleanup();
    }
  });

  it("runs the installed core through isolated deep lifecycle checks", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
      const report = await runDoctor({
        directory: project.targetDir,
        json: false,
        skipServices: false,
        deep: true,
      });

      expect(report.mode).toBe("deep");
      expect(report.checks.find((check) => check.id === "A8-REDIS-002"))
        .toMatchObject({ status: "pass" });
      expect(report.checks.find((check) => check.id === "A8-CORE-002"))
        .toMatchObject({ status: "pass" });
      expect(report.summary.failed).toBe(0);
    } finally {
      await project.cleanup();
    }
  });

  it("rejects every local-only fullstack production assumption", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
      const report = await runDoctor({
        directory: project.targetDir,
        json: false,
        skipServices: false,
        production: true,
        deep: true,
      });

      expect(report.mode).toBe("production");
      for (const id of [
        "A8-PROD-001",
        "A8-PROD-002",
        "A8-PROD-003",
        "A8-PROD-004",
        "A8-PROD-005",
      ]) {
        expect(report.checks.find((check) => check.id === id))
          .toMatchObject({ status: "fail" });
      }
    } finally {
      await project.cleanup();
    }
  });

  it("previews and atomically applies the safe environment-file fixes", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const ignorePath = path.join(project.targetDir, ".gitignore");
      const envPath = path.join(project.targetDir, ".env");
      const ignoredBefore = (await fs.readFile(ignorePath, "utf8"))
        .split(/\r?\n/)
        .filter((line) => !line.startsWith(".env"))
        .join("\n");
      await fs.writeFile(ignorePath, ignoredBefore);
      if (process.platform !== "win32") await fs.chmod(envPath, 0o644);

      const preview = await runDoctor({
        directory: project.targetDir,
        json: false,
        skipServices: false,
        fix: true,
        dryRun: true,
      });
      expect(preview.fixes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "fix.ignore-env", status: "planned" }),
      ]));
      expect(await fs.readFile(ignorePath, "utf8")).toBe(ignoredBefore);

      let planObservedBeforeMutation = false;
      const applied = await runDoctor(
        {
          directory: project.targetDir,
          json: false,
          skipServices: false,
          fix: true,
        },
        {
          onFixPlan: async (fixes) => {
            expect(fixes).toEqual(expect.arrayContaining([
              expect.objectContaining({ id: "fix.ignore-env", status: "planned" }),
            ]));
            planObservedBeforeMutation = !(await fs.readFile(ignorePath, "utf8"))
              .includes(".env");
          },
        },
      );
      expect(planObservedBeforeMutation).toBe(true);
      expect(applied.fixes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "fix.ignore-env", status: "applied" }),
      ]));
      expect(await fs.readFile(ignorePath, "utf8")).toContain(".env");
      expect(applied.checks.find((check) => check.id === "A8-ENV-001"))
        .toMatchObject({ status: "pass" });
      if (process.platform !== "win32") {
        expect((await fs.stat(envPath)).mode & 0o777).toBe(0o600);
        expect(applied.fixes).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: "fix.env-mode", status: "applied" }),
        ]));
      }
    } finally {
      await project.cleanup();
    }
  });

  it("writes a private schema-versioned support report without auth material", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, { realAuthCore: true });
      const report = await runDoctor({
        directory: project.targetDir,
        json: true,
        skipServices: true,
      });
      const hostileReport = {
        ...report,
        checks: [
          ...report.checks,
          {
            id: "A8-TEST-001",
            label: "Redaction fixture",
            status: "fail" as const,
            message: "Authorization: Basic private-value\nCookie: authenik8_refresh=cookie-secret",
          },
        ],
        privateJwkFixture: { d: "private-jwk-value" },
      };
      const reportPath = await writeDoctorSupportReport(
        hostileReport,
        new Date("2026-07-29T08:00:00.000Z"),
      );
      const source = await fs.readFile(reportPath, "utf8");
      expect(JSON.parse(source)).toMatchObject({
        schemaVersion: 1,
        report: { schemaVersion: 1 },
      });
      expect(source).not.toMatch(
        /private-value|cookie-secret|private-jwk-value|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\./,
      );
      if (process.platform !== "win32") {
        expect((await fs.stat(reportPath)).mode & 0o777).toBe(0o600);
      }
    } finally {
      await project.cleanup();
    }
  });
});
