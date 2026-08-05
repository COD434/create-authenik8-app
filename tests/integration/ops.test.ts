import { createRequire } from "node:module";
import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import {
  OpsRuntimeError,
  runOps,
} from "../../src/commands/ops/index.js";
import { formatOpsResult } from "../../src/commands/ops/output.js";
import {
  inspectUserSessions,
  revokeUserSessions,
} from "../../src/commands/ops/runtime.js";
import { createDoctorContext } from "../../src/commands/doctor/context.js";
import {
  generateProjectFixture,
  installGeneratedAppStubs,
} from "../helpers/generator.js";

function replaceEnvironmentValue(
  source: string,
  key: string,
  value: string,
): string {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(source)) throw new Error(`${key} is missing from fixture`);
  return source.replace(pattern, `${key}=${value}`);
}

async function writeCommonJsPackage(
  rootDir: string,
  name: string,
  source: string,
): Promise<void> {
  const directory = path.join(rootDir, "node_modules", name);
  await fs.ensureDir(directory);
  await fs.writeJson(path.join(directory, "package.json"), {
    name,
    type: "commonjs",
    main: "index.js",
  });
  await fs.writeFile(path.join(directory, "index.js"), source);
}

describe("generated project operations", () => {
  it("verifies real installed-core OAuth redirect initialization without provider I/O", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      database: "sqlite",
      oauthProviders: ["google"],
    });
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
      });
      const envPath = path.join(project.targetDir, ".env");
      let source = await fs.readFile(envPath, "utf8");
      source = replaceEnvironmentValue(
        source,
        "GOOGLE_CLIENT_ID",
        "ops-google-client",
      );
      source = replaceEnvironmentValue(
        source,
        "GOOGLE_CLIENT_SECRET",
        "gsec_7YLp4q9D2w6N8r3V5x1M0cZk",
      );
      source = replaceEnvironmentValue(
        source,
        "GOOGLE_REDIRECT_URI",
        "https://app.example.com/auth/google/callback",
      );
      await fs.writeFile(envPath, source);

      const result = await runOps({
        operation: "verify-oauth",
        directory: project.targetDir,
        json: true,
        provider: "google",
      });

      expect(result).toMatchObject({
        operation: "verify-oauth",
        status: "passed",
        assurance: "redirect-initialization",
        providers: [{
          provider: "google",
          status: "passed",
          authorizationHost: "accounts.google.com",
          stateStored: true,
        }],
      });
      expect(formatOpsResult(result, true)).not.toContain(
        "gsec_7YLp4q9D2w6N8r3V5x1M0cZk",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("rotates a generated key ring through atomic apply and Doctor verification", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: true,
    });
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
      });
      const before = await createDoctorContext(project.targetDir);
      const previousKid = before.env.AUTHENIK8_ACTIVE_KID!;
      const previousKeys = JSON.parse(
        before.env.AUTHENIK8_SIGNING_JWKS!,
      ) as Array<Record<string, unknown>>;
      const previousPrivateScalar = previousKeys[0]?.d;

      const planned = await runOps({
        operation: "rotate-signing-key",
        directory: project.targetDir,
        json: true,
        apply: false,
      });
      expect(planned.status).toBe("planned");

      const staged = await runOps({
        operation: "rotate-signing-key",
        directory: project.targetDir,
        json: true,
        apply: true,
        confirmActiveKid: previousKid,
      });
      const afterStage = await createDoctorContext(project.targetDir);
      const stagedKeys = JSON.parse(
        afterStage.env.AUTHENIK8_SIGNING_JWKS!,
      ) as Array<Record<string, unknown>>;

      expect(staged).toMatchObject({
        operation: "rotate-signing-key",
        status: "applied",
        verified: true,
        plan: {
          phase: "stage",
          activeKidAfter: previousKid,
        },
      });
      expect(afterStage.env.AUTHENIK8_ACTIVE_KID).toBe(previousKid);
      expect(stagedKeys).toHaveLength(previousKeys.length + 1);
      expect(stagedKeys.find((key) => key.kid === previousKid))
        .toHaveProperty("d");
      const targetKid = staged.operation === "rotate-signing-key"
        ? staged.plan.targetKid
        : "";
      expect(
        stagedKeys.find((key) => key.kid === targetKid),
      ).toHaveProperty("d");

      const activated = await runOps({
        operation: "rotate-signing-key",
        directory: project.targetDir,
        json: true,
        apply: true,
        activateKid: targetKid,
        confirmActiveKid: previousKid,
      });
      const afterActivation = await createDoctorContext(project.targetDir);
      const activatedKeys = JSON.parse(
        afterActivation.env.AUTHENIK8_SIGNING_JWKS!,
      ) as Array<Record<string, unknown>>;
      expect(activated).toMatchObject({
        status: "applied",
        verified: true,
        plan: {
          phase: "activate",
          targetKid,
          activeKidAfter: targetKid,
        },
      });
      expect(afterActivation.env.AUTHENIK8_ACTIVE_KID).toBe(targetKid);
      expect(activatedKeys.find((key) => key.kid === previousKid))
        .not.toHaveProperty("d");
      expect(activatedKeys.find((key) => key.kid === targetKid))
        .toHaveProperty("d");
      expect(formatOpsResult(activated, true)).not.toContain(
        String(previousPrivateScalar),
      );
    } finally {
      await project.cleanup();
    }
  });

  it("refuses cross-process revocation against an in-process memory store", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });
    try {
      const context = await createDoctorContext(project.targetDir);
      await expect(inspectUserSessions(context, "user-1")).rejects.toThrow(
        OpsRuntimeError,
      );
      await expect(inspectUserSessions(context, "user-1")).rejects.toThrow(
        "separate CLI process cannot reach",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("revokes only the targeted user's real core sessions through the isolated adapter", async () => {
    const project = await generateProjectFixture({
      template: "auth",
      database: "sqlite",
    });
    let redis: { disconnect(): void } | undefined;
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
      const ioredisPath = path.join(
        project.targetDir,
        "node_modules/ioredis",
      );
      await fs.remove(ioredisPath);
      await fs.ensureSymlink(
        path.resolve(import.meta.dirname, "../../node_modules/ioredis-mock"),
        ioredisPath,
        "junction",
      );
      const envPath = path.join(project.targetDir, ".env");
      let source = await fs.readFile(envPath, "utf8");
      source = /^REDIS_URL=/m.test(source)
        ? replaceEnvironmentValue(
            source,
            "REDIS_URL",
            "redis://ops-session.local:6379",
          )
        : `${source.replace(/\s*$/, "\n")}REDIS_URL=redis://ops-session.local:6379\n`;
      await fs.writeFile(envPath, source);
      const context = await createDoctorContext(project.targetDir);
      const requireFromProject = createRequire(
        path.join(project.targetDir, "package.json"),
      );
      const core = requireFromProject("authenik8-core") as {
        createAuthenik8(config: Record<string, unknown>): Promise<{
          issueTokens(payload: {
            userId: string;
            email: string;
          }): Promise<{ accessToken: string; refreshToken: string }>;
          listSessions(userId: string): Promise<unknown[]>;
          refreshToken(token: string): Promise<unknown>;
        }>;
      };
      const RedisModule = requireFromProject("ioredis") as {
        default?: new (url: string) => { disconnect(): void };
      } | (new (url: string) => { disconnect(): void });
      const Redis = typeof RedisModule === "function"
        ? RedisModule
        : RedisModule.default!;
      redis = new Redis(context.env.REDIS_URL!);
      const auth = await core.createAuthenik8({
        jwt: {
          keys: JSON.parse(context.env.AUTHENIK8_SIGNING_JWKS!),
          activeKid: context.env.AUTHENIK8_ACTIVE_KID,
          issuer: context.env.AUTHENIK8_ISSUER,
          audience: context.env.AUTHENIK8_AUDIENCE,
        },
        refreshSecret: context.env.REFRESH_SECRET,
        redis,
        security: {
          rateLimiterEnabled: false,
          whiteListEnabled: false,
          helmetEnabled: false,
        },
      });
      const first = await auth.issueTokens({
        userId: "user-1",
        email: "one@example.test",
      });
      await auth.issueTokens({
        userId: "user-1",
        email: "one@example.test",
      });
      await auth.issueTokens({
        userId: "user-2",
        email: "two@example.test",
      });

      const inspection = await inspectUserSessions(context, "user-1");
      expect(inspection.activeCoreSessions).toBe(2);
      const outcome = await revokeUserSessions(
        context,
        "user-1",
        "credential compromise",
        inspection,
      );

      expect(outcome).toMatchObject({
        coreRevoked: true,
        auditRecorded: true,
        plan: {
          userId: "user-1",
          activeCoreSessions: 2,
          reasonRecorded: true,
        },
      });
      expect(outcome.receiptPath).toContain(
        path.join(".authenik8", "operations"),
      );
      const receipt = await fs.readJson(outcome.receiptPath!) as {
        status: string;
        userId: string;
        reason: string;
      };
      expect(receipt).toMatchObject({
        status: "applied",
        userId: "user-1",
        reason: "credential compromise",
      });
      if (process.platform !== "win32") {
        expect((await fs.stat(outcome.receiptPath!)).mode & 0o777)
          .toBe(0o600);
      }
      expect(await auth.listSessions("user-1")).toHaveLength(0);
      expect(await auth.listSessions("user-2")).toHaveLength(1);
      await expect(auth.refreshToken(first.refreshToken)).rejects.toThrow();
    } finally {
      redis?.disconnect();
      await project.cleanup();
    }
  });

  it("coordinates fullstack database, audit, and core revocation through one explicit adapter", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });
    let redis: { disconnect(): void } | undefined;
    const prismaState = {
      users: new Set(["user-1"]),
      sessions: [
        { userId: "user-1", revokedAt: null as Date | null },
        { userId: "user-1", revokedAt: null as Date | null },
      ],
      auditEvents: [] as Array<Record<string, unknown>>,
    };
    (globalThis as Record<string, unknown>).__authenik8OpsPrismaState =
      prismaState;
    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realRedis: true,
      });
      const ioredisPath = path.join(
        project.targetDir,
        "node_modules/ioredis",
      );
      await fs.remove(ioredisPath);
      await fs.ensureSymlink(
        path.resolve(import.meta.dirname, "../../node_modules/ioredis-mock"),
        ioredisPath,
        "junction",
      );
      await writeCommonJsPackage(
        project.targetDir,
        "@prisma/adapter-pg",
        "exports.PrismaPg = class PrismaPg { constructor(options) { this.options = options; } };\n",
      );
      await writeCommonJsPackage(
        project.targetDir,
        "@prisma/client",
        `
class PrismaClient {
  constructor() {
    this.state = globalThis.__authenik8OpsPrismaState;
    this.user = {
      findUnique: async ({ where }) =>
        this.state.users.has(where.id) ? { id: where.id } : null,
    };
    this.session = {
      count: async ({ where }) =>
        this.state.sessions.filter((session) =>
          session.userId === where.userId && session.revokedAt === null
        ).length,
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const session of this.state.sessions) {
          if (session.userId === where.userId && session.revokedAt === null) {
            session.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      },
    };
    this.auditEvent = {
      create: async ({ data }) => {
        this.state.auditEvents.push(data);
        return data;
      },
    };
  }
  async $transaction(operation) { return await operation(this); }
  async $disconnect() {}
}
exports.PrismaClient = PrismaClient;
`,
      );
      const envPath = path.join(project.targetDir, ".env");
      const source = replaceEnvironmentValue(
        await fs.readFile(envPath, "utf8"),
        "REDIS_URL",
        "redis://ops-fullstack.local:6379",
      );
      await fs.writeFile(envPath, source);
      const context = await createDoctorContext(project.targetDir);
      const requireFromProject = createRequire(
        path.join(context.appDir, "package.json"),
      );
      const core = requireFromProject("authenik8-core") as {
        createAuthenik8(config: Record<string, unknown>): Promise<{
          issueTokens(payload: {
            userId: string;
            email: string;
          }): Promise<unknown>;
          listSessions(userId: string): Promise<unknown[]>;
        }>;
      };
      const RedisModule = requireFromProject("ioredis") as {
        default?: new (url: string) => { disconnect(): void };
      } | (new (url: string) => { disconnect(): void });
      const Redis = typeof RedisModule === "function"
        ? RedisModule
        : RedisModule.default!;
      redis = new Redis(context.env.REDIS_URL!);
      const auth = await core.createAuthenik8({
        jwt: {
          keys: JSON.parse(context.env.AUTHENIK8_SIGNING_JWKS!),
          activeKid: context.env.AUTHENIK8_ACTIVE_KID,
          issuer: context.env.AUTHENIK8_ISSUER,
          audience: context.env.AUTHENIK8_AUDIENCE,
        },
        refreshSecret: context.env.REFRESH_SECRET,
        redis,
        security: {
          rateLimiterEnabled: false,
          whiteListEnabled: false,
          helmetEnabled: false,
        },
      });
      await auth.issueTokens({
        userId: "user-1",
        email: "one@example.test",
      });

      const inspection = await inspectUserSessions(context, "user-1");
      expect(inspection).toEqual({
        activeCoreSessions: 1,
        activeDatabaseSessions: 2,
      });
      const outcome = await revokeUserSessions(
        context,
        "user-1",
        "credential compromise",
        inspection,
      );

      expect(outcome).toMatchObject({
        coreRevoked: true,
        databaseRevoked: true,
        auditRecorded: true,
      });
      expect(await auth.listSessions("user-1")).toHaveLength(0);
      expect(prismaState.sessions.every((session) => session.revokedAt))
        .toBe(true);
      expect(prismaState.auditEvents).toEqual([expect.objectContaining({
        actorId: null,
        action: "ops.sessions.revoked",
        targetType: "User",
        targetId: "user-1",
        metadata: {
          reason: "credential compromise",
          source: "create-authenik8-app",
        },
      })]);
    } finally {
      delete (globalThis as Record<string, unknown>)
        .__authenik8OpsPrismaState;
      redis?.disconnect();
      await project.cleanup();
    }
  });
});
