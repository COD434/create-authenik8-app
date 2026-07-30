import { generateKeyPairSync } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpsMutationError,
  OpsUsageError,
  opsExitCode,
  parseOpsArguments,
  runOps,
} from "../../src/commands/ops/index.js";
import { formatOpsResult } from "../../src/commands/ops/output.js";
import { prepareSigningRotation } from "../../src/commands/ops/signing.js";
import type { DoctorContext, DoctorReport } from "../../src/commands/doctor/types.js";

const cleanupDirectories: string[] = [];
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

afterEach(async () => {
  await Promise.all(
    cleanupDirectories.splice(0).map((directory) => fs.remove(directory)),
  );
});

function context(
  rootDir = "/tmp/generated-app",
  overrides: Partial<DoctorContext> = {},
): DoctorContext {
  return {
    rootDir,
    appDir: rootDir,
    preset: "auth-oauth",
    packageManager: "npm",
    packageJson: {},
    appPackageJson: {},
    env: {},
    envSource: ".env",
    oauthProviders: ["google"],
    usesPrisma: true,
    databaseProvider: "sqlite",
    manifest: { status: "missing" },
    ...overrides,
  };
}

function diagnostics(
  status: "pass" | "warn" | "fail" = "pass",
): DoctorReport {
  return {
    schemaVersion: 1,
    rootDir: "/tmp/generated-app",
    preset: "auth-oauth",
    mode: "production",
    checks: [{
      id: "A8-JWK-006",
      label: "Signing key ring",
      status,
      message: status,
    }],
    summary: {
      passed: status === "pass" ? 1 : 0,
      warnings: status === "warn" ? 1 : 0,
      failed: status === "fail" ? 1 : 0,
      skipped: 0,
    },
  };
}

describe("ops arguments", () => {
  it("parses the stable nested operation surface", () => {
    expect(parseOpsArguments(
      ["audit", "production", "project", "--json"],
      "/tmp/work",
    )).toMatchObject({
      help: false,
      operation: "audit-production",
      directory: path.resolve("/tmp/work/project"),
      json: true,
    });
    expect(parseOpsArguments(
      ["verify", "oauth", "github", "project"],
      "/tmp/work",
    )).toMatchObject({
      operation: "verify-oauth",
      provider: "github",
      directory: path.resolve("/tmp/work/project"),
    });
    expect(parseOpsArguments(
      ["readiness", "project"],
      "/tmp/work",
    )).toMatchObject({
      operation: "readiness",
      directory: path.resolve("/tmp/work/project"),
    });
  });

  it("makes mutation scope and target confirmation explicit", () => {
    expect(() => parseOpsArguments([
      "revoke",
      "user",
      "user-1",
    ])).toThrow("--all-sessions");
    expect(() => parseOpsArguments([
      "revoke",
      "user",
      "user-1",
      "--all-sessions",
      "--apply",
      "--confirm-user",
      "user-2",
      "--reason",
      "security response",
    ])).toThrow(OpsUsageError);
    expect(() => parseOpsArguments([
      "rotate",
      "signing-key",
      "--confirm-active-kid",
      "kid-1",
    ])).toThrow("requires --apply");
    expect(() => parseOpsArguments([
      "rotate",
      "signing-key",
      "--activate-kid",
      "kid-1",
      "--activate-kid",
      "kid-2",
    ])).toThrow("only once");

    expect(parseOpsArguments([
      "revoke",
      "user",
      "user-1",
      "--all-sessions",
      "--apply",
      "--confirm-user",
      "user-1",
      "--reason",
      "credential compromise",
    ])).toMatchObject({
      operation: "revoke-user-sessions",
      userId: "user-1",
      apply: true,
      reason: "credential compromise",
    });
  });
});

describe("ops orchestration", () => {
  it("treats production warnings as not ready and writes no report", async () => {
    const writeSupportReport = vi.fn();
    const result = await runOps(
      {
        operation: "readiness",
        directory: "/tmp/generated-app",
        json: false,
      },
      {
        createContext: async () => context(),
        runDiagnostics: async () => diagnostics("warn"),
        writeSupportReport,
        now: () => new Date("2026-07-29T10:00:00.000Z"),
      },
    );

    expect(result.status).toBe("failed");
    expect(opsExitCode(result)).toBe(1);
    expect(writeSupportReport).not.toHaveBeenCalled();
  });

  it("creates a private evidence report only for production audit", async () => {
    const result = await runOps(
      {
        operation: "audit-production",
        directory: "/tmp/generated-app",
        json: true,
      },
      {
        createContext: async () => context(),
        runDiagnostics: async () => diagnostics(),
        writeSupportReport: async () => "/tmp/generated-app/.authenik8/report.json",
      },
    );

    expect(result).toMatchObject({
      operation: "audit-production",
      status: "passed",
      reportPath: "/tmp/generated-app/.authenik8/report.json",
    });
  });

  it("states the exact OAuth assurance without claiming provider connectivity", async () => {
    const result = await runOps(
      {
        operation: "verify-oauth",
        directory: "/tmp/generated-app",
        json: true,
        provider: "google",
      },
      {
        createContext: async () => context(),
        runDiagnostics: async () => ({
          ...diagnostics(),
          checks: [{
            id: "A8-OAUTH-002",
            label: "Google OAuth",
            status: "pass",
            message: "configured",
          }],
        }),
        verifyOAuth: async () => [{
          provider: "google",
          status: "passed",
          authorizationHost: "accounts.google.com",
          stateStored: true,
          message: "passed",
        }],
      },
    );
    const output = formatOpsResult(result, true);

    expect(result).toMatchObject({
      status: "passed",
      assurance: "redirect-initialization",
    });
    expect(output).toContain("does not contact the provider");
    expect(output).not.toContain("clientSecret");
  });

  it("rolls signing configuration back when post-apply verification fails", async () => {
    const rollback = vi.fn(async () => undefined);
    const apply = vi.fn(async () => rollback);
    await expect(runOps(
      {
        operation: "rotate-signing-key",
        directory: "/tmp/generated-app",
        json: false,
        apply: true,
        confirmActiveKid: "kid-old",
      },
      {
        createContext: async () => context("/tmp/generated-app", {
          env: { AUTHENIK8_ACTIVE_KID: "kid-new" },
        }),
        prepareRotation: async () => ({
          plan: {
            environmentFile: ".env",
            phase: "activate",
            previousActiveKid: "kid-old",
            targetKid: "kid-new",
            activeKidAfter: "kid-new",
            retainedKeyCount: 1,
            resultingKeyCount: 2,
            deploymentInstruction: "deploy",
          },
          apply,
        }),
        runDiagnostics: async () => diagnostics("fail"),
      },
    )).rejects.toThrow(OpsMutationError);
    expect(apply).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("keeps revocation plan-first and invokes one isolated adapter on apply", async () => {
    const revokeSessions = vi.fn(async () => ({
      plan: {
        userId: "user-1",
        activeCoreSessions: 2,
        reasonRecorded: false,
      },
      coreRevoked: true,
    }));
    const runtime = {
      createContext: async () => context("/tmp/generated-app", {
        preset: "auth",
        oauthProviders: [],
      }),
      inspectSessions: async () => ({ activeCoreSessions: 2 }),
      revokeSessions,
    };
    const planned = await runOps({
      operation: "revoke-user-sessions",
      directory: "/tmp/generated-app",
      json: false,
      userId: "user-1",
      apply: false,
    }, runtime);
    expect(planned.status).toBe("planned");
    expect(revokeSessions).not.toHaveBeenCalled();

    const applied = await runOps({
      operation: "revoke-user-sessions",
      directory: "/tmp/generated-app",
      json: false,
      userId: "user-1",
      apply: true,
      confirmUser: "user-1",
      reason: "credential compromise",
    }, runtime);
    expect(applied.status).toBe("applied");
    expect(revokeSessions).toHaveBeenCalledOnce();
  });

  it("enforces revocation confirmation inside the public runner too", async () => {
    const inspectSessions = vi.fn(async () => ({ activeCoreSessions: 1 }));
    await expect(runOps({
      operation: "revoke-user-sessions",
      directory: "/tmp/generated-app",
      json: false,
      userId: "user-1",
      apply: true,
      confirmUser: "user-2",
      reason: "credential compromise",
    }, {
      createContext: async () => context(),
      inspectSessions,
    })).rejects.toThrow("--confirm-user");
    expect(inspectSessions).not.toHaveBeenCalled();
  });

  it("surfaces distributed revocation cleanup as a partial exit", async () => {
    const result = await runOps({
      operation: "revoke-user-sessions",
      directory: "/tmp/generated-app",
      json: false,
      userId: "user-1",
      apply: true,
      confirmUser: "user-1",
      reason: "credential compromise",
    }, {
      createContext: async () => context("/tmp/generated-app", {
        preset: "fullstack",
        databaseProvider: "postgresql",
      }),
      inspectSessions: async () => ({
        activeCoreSessions: 1,
        activeDatabaseSessions: 1,
      }),
      revokeSessions: async (_context, userId) => ({
        plan: {
          userId,
          activeCoreSessions: 1,
          activeDatabaseSessions: 1,
          reasonRecorded: true,
        },
        coreRevoked: false,
        databaseRevoked: true,
        auditRecorded: true,
        partialMessage: "Redis cleanup failed",
      }),
    });

    expect(result.status).toBe("partial");
    expect(opsExitCode(result)).toBe(4);
  });
});

describe("signing-key transaction", () => {
  it("rejects staged private material that does not match its public key", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-ops-"));
    cleanupDirectories.push(rootDir);
    const { privateKey: activePrivateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const { privateKey: stagedPrivateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const active = {
      ...activePrivateKey.export({ format: "jwk" }),
      kid: "kid-active",
      alg: "ES256",
      use: "sig",
      key_ops: ["sign"],
    };
    const staged = {
      ...stagedPrivateKey.export({ format: "jwk" }),
      d: active.d,
      kid: "kid-staged",
      alg: "ES256",
      use: "sig",
      key_ops: ["sign"],
    };
    await fs.writeFile(
      path.join(rootDir, ".env"),
      [
        `AUTHENIK8_SIGNING_JWKS='${JSON.stringify([active, staged])}'`,
        `AUTHENIK8_ACTIVE_KID=${active.kid}`,
        "",
      ].join("\n"),
    );

    await expect(prepareSigningRotation(
      context(rootDir, {
        appDir: repositoryRoot,
        env: {
          AUTHENIK8_SIGNING_JWKS: JSON.stringify([active, staged]),
          AUTHENIK8_ACTIVE_KID: active.kid,
        },
      }),
      new Date("2026-07-29T10:00:00.000Z"),
      staged.kid,
    )).rejects.toThrow("installed authenik8-core rejected the signing key ring");
  });

  it("stages without switching the active key, then activates safely in a second transaction", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-ops-"));
    cleanupDirectories.push(rootDir);
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const originalKey = {
      ...privateKey.export({ format: "jwk" }),
      kid: "kid-old",
      alg: "ES256",
      use: "sig",
      key_ops: ["sign"],
    };
    const envPath = path.join(rootDir, ".env");
    const source = [
      "# preserve this comment",
      `AUTHENIK8_SIGNING_JWKS='${JSON.stringify([originalKey])}'`,
      "AUTHENIK8_ACTIVE_KID=kid-old",
      "UNRELATED=value",
      "",
    ].join("\n");
    await fs.writeFile(envPath, source, { mode: 0o644 });
    const signingContext = context(rootDir, {
      appDir: repositoryRoot,
      env: {
        AUTHENIK8_SIGNING_JWKS: JSON.stringify([originalKey]),
        AUTHENIK8_ACTIVE_KID: "kid-old",
      },
    });

    const prepared = await prepareSigningRotation(
      signingContext,
      new Date("2026-07-29T10:00:00.000Z"),
    );
    expect(await fs.readFile(envPath, "utf8")).toBe(source);
    expect(JSON.stringify(prepared.plan)).not.toContain(originalKey.d);

    const rollbackStage = await prepared.apply();
    const staged = await fs.readFile(envPath, "utf8");
    const stagedContextValue = staged.match(
      /^AUTHENIK8_SIGNING_JWKS='(.*)'$/m,
    )?.[1];
    const stagedKeys = JSON.parse(stagedContextValue ?? "[]") as Array<Record<string, unknown>>;
    expect(stagedKeys).toHaveLength(2);
    expect(stagedKeys[0]).toHaveProperty("d");
    expect(stagedKeys[0]).toMatchObject({ kid: "kid-old", key_ops: ["sign"] });
    expect(stagedKeys[1]).toMatchObject({
      kid: prepared.plan.targetKid,
      key_ops: ["sign"],
    });
    expect(stagedKeys[1]).toHaveProperty("d");
    expect(staged).toContain("AUTHENIK8_ACTIVE_KID=kid-old");
    expect(staged).toContain("# preserve this comment");
    expect(staged).toContain("UNRELATED=value");
    if (process.platform !== "win32") {
      expect((await fs.stat(envPath)).mode & 0o777).toBe(0o600);
    }

    const activation = await prepareSigningRotation(
      context(rootDir, {
        appDir: repositoryRoot,
        env: {
          AUTHENIK8_SIGNING_JWKS: JSON.stringify(stagedKeys),
          AUTHENIK8_ACTIVE_KID: "kid-old",
        },
      }),
      new Date("2026-07-29T10:01:00.000Z"),
      prepared.plan.targetKid,
    );
    await expect(prepareSigningRotation(
      context(rootDir, {
        appDir: repositoryRoot,
        env: {
          AUTHENIK8_SIGNING_JWKS: JSON.stringify(stagedKeys),
          AUTHENIK8_ACTIVE_KID: "kid-old",
        },
      }),
    )).rejects.toThrow("already staged");
    expect(activation.plan).toMatchObject({
      phase: "activate",
      targetKid: prepared.plan.targetKid,
      activeKidAfter: prepared.plan.targetKid,
      resultingKeyCount: 2,
    });
    const rollbackActivation = await activation.apply();
    const activated = await fs.readFile(envPath, "utf8");
    const activatedValue = activated.match(
      /^AUTHENIK8_SIGNING_JWKS='(.*)'$/m,
    )?.[1];
    const activatedKeys = JSON.parse(activatedValue ?? "[]") as Array<Record<string, unknown>>;
    expect(activatedKeys.find((key) => key.kid === "kid-old"))
      .not.toHaveProperty("d");
    expect(activatedKeys.find((key) => key.kid === prepared.plan.targetKid))
      .toHaveProperty("d");
    expect(activated).toContain(
      `AUTHENIK8_ACTIVE_KID=${prepared.plan.targetKid}`,
    );

    await rollbackActivation();
    expect(await fs.readFile(envPath, "utf8")).toBe(staged);
    await rollbackStage();
    expect(await fs.readFile(envPath, "utf8")).toBe(source);

    const conflicting = await prepareSigningRotation(signingContext);
    const concurrentlyChanged = `${source}# concurrent operator change\n`;
    await fs.writeFile(envPath, concurrentlyChanged);
    await expect(conflicting.apply()).rejects.toThrow(
      ".env changed after the rotation plan",
    );
    expect(await fs.readFile(envPath, "utf8")).toBe(concurrentlyChanged);
  });
});
