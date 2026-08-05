import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import type { Authenik8Instance } from "authenik8-core";

import type { OAuthProvider } from "../../lib/oauth.js";
import {
  loadProjectEngine,
  type ProjectEngine,
  type ProjectEngineExport,
} from "../../lib/projectEngine.js";
import type { DoctorContext } from "../doctor/types.js";
import type {
  OAuthVerification,
  SessionInspection,
  SessionRevocationPlan,
} from "./types.js";
import {
  beginRevocationReceipt,
  OpsReceiptError,
} from "./receipt.js";

export class OpsRuntimeError extends Error {}
export { OpsReceiptError };

type RedisLike = {
  disconnect?(): void;
  quit?(): Promise<unknown>;
};

type RedisConstructor = new (...args: unknown[]) => RedisLike;

type CoreInstance = Authenik8Instance;

type PrismaClientLike = {
  user: {
    findUnique(args: Record<string, unknown>): Promise<unknown>;
  };
  session: {
    count(args: Record<string, unknown>): Promise<number>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  auditEvent: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  $transaction<T>(
    operation: (transaction: PrismaClientLike) => Promise<T>,
  ): Promise<T>;
  $disconnect(): Promise<void>;
};

type PrismaClientConstructor = new (
  options: Record<string, unknown>,
) => PrismaClientLike;

type PrismaAdapterConstructor = new (
  options: Record<string, unknown>,
) => unknown;

export type SessionRevocationOutcome = {
  plan: SessionRevocationPlan;
  coreRevoked: boolean;
  databaseRevoked?: boolean;
  auditRecorded?: boolean;
  receiptPath?: string;
  partialMessage?: string;
};

function safeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)(?:[^@\s/]+)@/gi,
      "$1<redacted>@",
    )
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "<redacted-authorization>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,}){2}\b/g, "<redacted-jwt>")
    .slice(0, 400);
}

function projectRequire(context: DoctorContext) {
  return createRequire(path.join(context.appDir, "package.json"));
}

function loadProjectModule(
  context: DoctorContext,
  packageName: string,
): unknown {
  try {
    return projectRequire(context)(packageName);
  } catch (error) {
    throw new OpsRuntimeError(
      `Could not load ${packageName} from the generated application: ${safeError(error)}`,
    );
  }
}

function exportedFunction<T extends (...args: never[]) => unknown>(
  value: unknown,
  name: string,
  packageName: string,
): T {
  if (
    value
    && typeof value === "object"
    && name in value
    && typeof (value as Record<string, unknown>)[name] === "function"
  ) {
    return (value as Record<string, unknown>)[name] as T;
  }
  throw new OpsRuntimeError(`${packageName} does not export ${name}().`);
}

function moduleConstructor(
  value: unknown,
  packageName: string,
): RedisConstructor {
  if (typeof value === "function") return value as RedisConstructor;
  if (
    value
    && typeof value === "object"
    && "default" in value
    && typeof value.default === "function"
  ) {
    return value.default as RedisConstructor;
  }
  throw new OpsRuntimeError(
    `${packageName} does not export a Redis constructor.`,
  );
}

function createRedis(context: DoctorContext): RedisLike {
  const redisUrl = context.env.REDIS_URL?.trim();
  if (redisUrl === "memory://") {
    throw new OpsRuntimeError(
      "Session maintenance cannot operate on memory:// because a separate CLI process cannot reach the application's in-process session store.",
    );
  }
  const Redis = moduleConstructor(
    loadProjectModule(context, "ioredis"),
    "ioredis",
  );
  if (redisUrl) {
    return new Redis(redisUrl, {
      connectTimeout: 5_000,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }
  return new Redis({
    host: context.env.REDIS_HOST?.trim() || "127.0.0.1",
    port: Number(context.env.REDIS_PORT?.trim() || "6379"),
    ...(context.env.REDIS_PASSWORD?.trim()
      ? { password: context.env.REDIS_PASSWORD.trim() }
      : {}),
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    enableReadyCheck: true,
  });
}

async function closeRedis(redis: RedisLike): Promise<void> {
  if (redis.disconnect) redis.disconnect();
  else await redis.quit?.();
}

function coreModule(
  context: DoctorContext,
  additionalExports: readonly ProjectEngineExport[] = [],
): ProjectEngine {
  try {
    return loadProjectEngine(
      context.appDir,
      ["createAuthenik8", ...additionalExports],
    );
  } catch (error) {
    throw new OpsRuntimeError(
      `Could not load authenik8-core from the generated application: ${safeError(error)}`,
    );
  }
}

function jwtConfiguration(context: DoctorContext): Record<string, unknown> {
  let keys: unknown;
  try {
    keys = JSON.parse(context.env.AUTHENIK8_SIGNING_JWKS ?? "");
  } catch {
    throw new OpsRuntimeError(
      "AUTHENIK8_SIGNING_JWKS must be valid before session maintenance.",
    );
  }
  return {
    keys,
    activeKid: context.env.AUTHENIK8_ACTIVE_KID,
    issuer: context.env.AUTHENIK8_ISSUER,
    audience: context.env.AUTHENIK8_AUDIENCE,
  };
}

async function createOperationalCore(
  context: DoctorContext,
  redis: RedisLike,
): Promise<CoreInstance> {
  const refreshSecret = context.env.REFRESH_SECRET;
  if (!refreshSecret || Buffer.byteLength(refreshSecret, "utf8") < 32) {
    throw new OpsRuntimeError(
      "REFRESH_SECRET must be valid before session maintenance.",
    );
  }
  return coreModule(context).createAuthenik8({
    jwt: jwtConfiguration(context),
    refreshSecret,
    redis,
    security: {
      rateLimiterEnabled: false,
      whiteListEnabled: false,
      helmetEnabled: false,
    },
  });
}

async function withOperationalCore<T>(
  context: DoctorContext,
  operation: (core: CoreInstance) => Promise<T>,
): Promise<T> {
  const redis = createRedis(context);
  try {
    return await operation(await createOperationalCore(context, redis));
  } catch (error) {
    if (error instanceof OpsRuntimeError) throw error;
    throw new OpsRuntimeError(
      `Session store operation failed: ${safeError(error)}`,
    );
  } finally {
    await closeRedis(redis);
  }
}

function oauthConfig(
  context: DoctorContext,
  provider: OAuthProvider,
  stateStore: {
    set(
      state: string,
      value: { userId: string | null; mode: "login" | "link" },
      ttlSeconds: number,
    ): Promise<void>;
    take(
      state: string,
    ): Promise<{ userId: string | null; mode: "login" | "link" } | null>;
  },
): Record<string, unknown> {
  const prefix = provider.toUpperCase();
  return {
    [provider]: {
      clientId: context.env[`${prefix}_CLIENT_ID`] ?? "",
      clientSecret: context.env[`${prefix}_CLIENT_SECRET`] ?? "",
      redirectUri: context.env[`${prefix}_REDIRECT_URI`] ?? "",
    },
    stateStore,
  };
}

async function verifyOAuthProvider(
  context: DoctorContext,
  provider: OAuthProvider,
): Promise<OAuthVerification> {
  const states = new Map<
    string,
    { userId: string | null; mode: "login" | "link" }
  >();
  const callbackBoundary = new Error(
    "OAuth verification stopped after isolated state consumption",
  );
  let stopAfterStateConsumption = false;
  let stateTakeCalls = 0;
  const stateStore = {
    async set(
      state: string,
      value: { userId: string | null; mode: "login" | "link" },
      ttlSeconds: number,
    ) {
      if (
        !/^[a-f0-9]{64}$/.test(state)
        || !Number.isSafeInteger(ttlSeconds)
        || ttlSeconds < 1
        || ttlSeconds > 600
      ) {
        throw new Error("invalid isolated OAuth state");
      }
      states.set(state, value);
    },
    async take(state: string) {
      stateTakeCalls += 1;
      const value = states.get(state) ?? null;
      states.delete(state);
      if (value && stopAfterStateConsumption) throw callbackBoundary;
      return value;
    },
  };

  try {
    const core = coreModule(context, ["generateSigningJwk"]);
    const kid = `ops-oauth-${randomUUID()}`;
    const auth = await core.createAuthenik8({
      jwt: {
        keys: [await core.generateSigningJwk(kid)],
        activeKid: kid,
        issuer: "https://ops.authenik8.invalid",
        audience: `ops-oauth-${randomUUID()}`,
      },
      refreshSecret: randomBytes(48).toString("base64url"),
      oauth: oauthConfig(context, provider, stateStore),
      // Redirect initialization uses the isolated stateStore. The inert Redis
      // value prevents any production session or OAuth state writes.
      redis: {
        on() {
          return this;
        },
      },
      redisKeyPrefix: `authenik8:ops:${randomUUID()}`,
      security: {
        rateLimiterEnabled: false,
        whiteListEnabled: false,
        helmetEnabled: false,
      },
    });
    const oauthProvider = auth.oauth?.[provider];
    if (!oauthProvider) {
      throw new Error("the installed core did not initialize the provider");
    }

    let redirectLocation: string | undefined;
    let responseStatus: number | undefined;
    const response: Record<string, unknown> = {
      headersSent: false,
      status(code: number) {
        responseStatus = code;
        return response;
      },
      json() {
        return response;
      },
      redirect(location: string) {
        redirectLocation = location;
        response.headersSent = true;
        return response;
      },
    };
    await oauthProvider.redirect(
      { query: {}, headers: {}, socket: {}, user: undefined } as never,
      response as never,
      "login",
    );
    if (!redirectLocation || (responseStatus && responseStatus >= 400)) {
      throw new Error("the provider rejected redirect initialization");
    }

    const authorizationUrl = new URL(redirectLocation);
    const expectedHost = provider === "google"
      ? "accounts.google.com"
      : "github.com";
    const state = authorizationUrl.searchParams.get("state");
    if (
      authorizationUrl.protocol !== "https:"
      || authorizationUrl.hostname !== expectedHost
      || !state
      || !/^[a-f0-9]{64}$/.test(state)
      || !states.has(state)
    ) {
      throw new Error("the generated authorization redirect was not canonical");
    }
    stopAfterStateConsumption = true;
    let firstCallbackStoppedAtBoundary = false;
    try {
      await oauthProvider.handleCallback({
        query: { state },
        headers: {},
        socket: {},
      } as never);
    } catch (error) {
      firstCallbackStoppedAtBoundary = error === callbackBoundary;
    }
    const consumedByFirstCallback = states.size === 0;
    let replayCallbackRejected = false;
    try {
      await oauthProvider.handleCallback({
        query: { state },
        headers: {},
        socket: {},
      } as never);
    } catch {
      replayCallbackRejected = true;
    }
    if (
      !firstCallbackStoppedAtBoundary
      || !consumedByFirstCallback
      || !replayCallbackRejected
      || states.size !== 0
      || stateTakeCalls !== 2
    ) {
      throw new Error("the isolated OAuth state was not consumed exactly once");
    }

    return {
      provider,
      status: "passed",
      authorizationHost: authorizationUrl.hostname,
      stateStored: true,
      message: "Installed core initialized a canonical redirect with one-use isolated state",
    };
  } catch (error) {
    return {
      provider,
      status: "failed",
      stateStored: false,
      message: safeError(error),
    };
  }
}

export async function verifyOAuthProviders(
  context: DoctorContext,
  requestedProvider?: OAuthProvider,
): Promise<OAuthVerification[]> {
  const providers = requestedProvider
    ? [requestedProvider]
    : context.oauthProviders;
  if (providers.length === 0) {
    throw new OpsRuntimeError(
      "No supported OAuth providers are enabled in this project.",
    );
  }
  if (
    requestedProvider
    && !context.oauthProviders.includes(requestedProvider)
  ) {
    throw new OpsRuntimeError(
      `${requestedProvider} is not enabled in this project.`,
    );
  }
  return await Promise.all(
    providers.map((provider) => verifyOAuthProvider(context, provider)),
  );
}

function exportedConstructor<T>(
  value: unknown,
  name: string,
  packageName: string,
): T {
  if (
    value
    && typeof value === "object"
    && name in value
    && typeof (value as Record<string, unknown>)[name] === "function"
  ) {
    return (value as Record<string, unknown>)[name] as T;
  }
  throw new OpsRuntimeError(`${packageName} does not export ${name}.`);
}

function createPrisma(context: DoctorContext): PrismaClientLike {
  const databaseUrl = context.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new OpsRuntimeError(
      "DATABASE_URL is required for fullstack session maintenance.",
    );
  }
  const PrismaClient = exportedConstructor<PrismaClientConstructor>(
    loadProjectModule(context, "@prisma/client"),
    "PrismaClient",
    "@prisma/client",
  );
  const PrismaPg = exportedConstructor<PrismaAdapterConstructor>(
    loadProjectModule(context, "@prisma/adapter-pg"),
    "PrismaPg",
    "@prisma/adapter-pg",
  );
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

async function inspectDatabaseSessions(
  context: DoctorContext,
  userId: string,
): Promise<number> {
  const prisma = createPrisma(context);
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new OpsRuntimeError(`User ${userId} was not found.`);
    return await prisma.session.count({
      where: { userId, revokedAt: null },
    });
  } catch (error) {
    if (error instanceof OpsRuntimeError) throw error;
    throw new OpsRuntimeError(
      `Database session inspection failed: ${safeError(error)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function inspectUserSessions(
  context: DoctorContext,
  userId: string,
): Promise<SessionInspection> {
  const activeCoreSessions = await withOperationalCore(
    context,
    async (core) => (await core.listSessions(userId)).length,
  );
  if (context.preset !== "fullstack") return { activeCoreSessions };
  return {
    activeCoreSessions,
    activeDatabaseSessions: await inspectDatabaseSessions(context, userId),
  };
}

async function revokeDatabaseSessions(
  context: DoctorContext,
  userId: string,
  reason: string,
): Promise<void> {
  const prisma = createPrisma(context);
  try {
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new OpsRuntimeError(`User ${userId} was not found.`);
      await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: null,
          action: "ops.sessions.revoked",
          targetType: "User",
          targetId: userId,
          metadata: {
            reason,
            source: "create-authenik8-app",
          },
          ipAddress: null,
        },
      });
    });
  } catch (error) {
    if (error instanceof OpsRuntimeError) throw error;
    throw new OpsRuntimeError(
      `Database session revocation failed: ${safeError(error)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function revokeUserSessions(
  context: DoctorContext,
  userId: string,
  reason: string,
  inspection: SessionInspection,
): Promise<SessionRevocationOutcome> {
  const plan: SessionRevocationPlan = {
    userId,
    activeCoreSessions: inspection.activeCoreSessions,
    ...(inspection.activeDatabaseSessions === undefined
      ? {}
      : { activeDatabaseSessions: inspection.activeDatabaseSessions }),
    reasonRecorded: context.preset === "fullstack",
  };

  if (context.preset === "fullstack") {
    await revokeDatabaseSessions(context, userId, reason);
    try {
      await withOperationalCore(
        context,
        async (core) => await core.revokeAllSessions(userId),
      );
      return {
        plan,
        coreRevoked: true,
        databaseRevoked: true,
        auditRecorded: true,
      };
    } catch (error) {
      return {
        plan,
        coreRevoked: false,
        databaseRevoked: true,
        auditRecorded: true,
        partialMessage:
          `Database sessions were revoked and audited, but Redis cleanup failed: ${safeError(error)}`,
      };
    }
  }

  const receipt = await beginRevocationReceipt(
    context,
    userId,
    reason,
    inspection,
  );
  try {
    await withOperationalCore(
      context,
      async (core) => await core.revokeAllSessions(userId),
    );
  } catch (error) {
    try {
      await receipt.complete("failed", safeError(error));
    } catch {}
    throw error;
  }
  try {
    await receipt.complete("applied");
    return {
      plan: { ...plan, reasonRecorded: true },
      coreRevoked: true,
      auditRecorded: true,
      receiptPath: receipt.path,
    };
  } catch (error) {
    return {
      plan,
      coreRevoked: true,
      auditRecorded: false,
      receiptPath: receipt.path,
      partialMessage:
        `Core sessions were revoked, but the private operation receipt could not be finalized: ${safeError(error)}`,
    };
  }
}
