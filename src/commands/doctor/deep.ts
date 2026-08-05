import { createRequire } from "node:module";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { loadProjectEngine } from "../../lib/projectEngine.js";
import type { DoctorCheck, DoctorContext } from "./types.js";

type RedisLike = {
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<unknown>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  getdel?(key: string): Promise<string | null>;
  eval?(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown>;
  disconnect?(): void;
  quit?(): Promise<unknown>;
};

type RedisConstructor = new (...args: unknown[]) => RedisLike;

const TAKE_VALUE_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if value then
  redis.call("DEL", KEYS[1])
end
return value
`;

function check(
  id: string,
  label: string,
  status: DoctorCheck["status"],
  message: string,
  fix?: string,
): DoctorCheck {
  return { id, label, status, message, ...(fix ? { fix } : {}) };
}

function safeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail
    .replace(
      /\b(redis(?:s)?:\/\/)(?:[^@\s/]+)@/gi,
      "$1<redacted>@",
    )
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted>")
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "<redacted-jwt>",
    )
    .slice(0, 500);
}

function moduleConstructor(value: unknown, packageName: string): RedisConstructor {
  if (typeof value === "function") return value as RedisConstructor;
  if (
    value
    && typeof value === "object"
    && "default" in value
    && typeof value.default === "function"
  ) {
    return value.default as RedisConstructor;
  }
  throw new Error(`${packageName} does not export a Redis constructor`);
}

function projectRequire(context: DoctorContext) {
  return createRequire(path.join(context.appDir, "package.json"));
}

function loadProjectModule(
  context: DoctorContext,
  packageName: string,
): unknown {
  return projectRequire(context)(packageName);
}

function usableRedis(value: RedisLike): boolean {
  return typeof value.set === "function"
    && typeof value.get === "function"
    && typeof value.del === "function"
    && typeof value.exists === "function"
    && typeof value.expire === "function"
    && typeof value.ttl === "function"
    && typeof value.keys === "function";
}

function redisFromPackage(
  context: DoctorContext,
  packageName: string,
  args: unknown[],
): RedisLike {
  const Constructor = moduleConstructor(
    projectRequire(context)(packageName),
    packageName,
  );
  const redis = new Constructor(...args);
  if (usableRedis(redis)) return redis;
  redis.disconnect?.();
  throw new Error(
    `${packageName} does not implement the Redis commands required by deep diagnostics`,
  );
}

function createRedis(context: DoctorContext): RedisLike {
  const redisUrl = context.env.REDIS_URL?.trim();
  if (redisUrl === "memory://") {
    return redisFromPackage(
      context,
      "ioredis-mock",
      [],
    );
  }

  if (redisUrl) {
    return redisFromPackage(
      context,
      "ioredis",
      [redisUrl],
    );
  }
  return redisFromPackage(
    context,
    "ioredis",
    [{
      host: context.env.REDIS_HOST?.trim() || "127.0.0.1",
      port: Number(context.env.REDIS_PORT?.trim() || "6379"),
      ...(context.env.REDIS_PASSWORD?.trim()
        ? { password: context.env.REDIS_PASSWORD.trim() }
        : {}),
    }],
  );
}

async function verifyRedisCapabilities(
  redis: RedisLike,
  namespace: string,
): Promise<void> {
  const valueKey = `${namespace}:capability:value`;
  const lockKey = `${namespace}:capability:lock`;
  const atomicKey = `${namespace}:capability:atomic`;

  await redis.set(valueKey, "doctor", "EX", 60);
  if (await redis.get(valueKey) !== "doctor") {
    throw new Error("Redis SET/GET round trip failed");
  }
  if (await redis.exists(valueKey) !== 1) {
    throw new Error("Redis EXISTS failed");
  }
  await redis.expire(valueKey, 60);
  const ttl = await redis.ttl(valueKey);
  if (ttl < 1 || ttl > 60) {
    throw new Error("Redis expiry did not produce a bounded TTL");
  }

  const lock = await redis.set(lockKey, "owner", "PX", 30_000, "NX");
  const competingLock = await redis.set(
    lockKey,
    "competitor",
    "PX",
    30_000,
    "NX",
  );
  if (lock !== "OK" || competingLock !== null) {
    throw new Error("Redis conditional locking failed");
  }

  await redis.set(atomicKey, "consume-once", "EX", 60);
  const consumed = redis.getdel
    ? await redis.getdel(atomicKey)
    : redis.eval
      ? await redis.eval(TAKE_VALUE_SCRIPT, 1, atomicKey)
      : undefined;
  if (consumed !== "consume-once" || await redis.get(atomicKey) !== null) {
    throw new Error("Redis atomic consume operation failed");
  }

  await redis.del(valueKey, lockKey, atomicKey);
  if (await redis.exists(valueKey) !== 0) {
    throw new Error("Redis deletion failed");
  }
}

async function rejects(operation: Promise<unknown>): Promise<boolean> {
  try {
    await operation;
    return false;
  } catch {
    return true;
  }
}

async function verifyCoreRuntime(
  context: DoctorContext,
  redis: RedisLike,
  namespace: string,
): Promise<void> {
  const core = loadProjectEngine(
    context.appDir,
    ["createAuthenik8", "generateSigningJwk"],
  );

  const issuer = "https://doctor.authenik8.invalid";
  const audience = `doctor-${randomUUID()}`;
  const activeKid = `doctor-${randomUUID()}`;
  const signingJwk = await core.generateSigningJwk(activeKid);
  const auth = await core.createAuthenik8({
    jwt: {
      keys: [signingJwk],
      activeKid,
      issuer,
      audience,
    },
    refreshSecret: randomBytes(48).toString("base64url"),
    redis,
    redisKeyPrefix: namespace,
    security: {
      rateLimiterEnabled: false,
      whiteListEnabled: false,
      helmetEnabled: false,
    },
  });

  const first = await auth.issueTokens({
    userId: `doctor-user-${randomUUID()}`,
    email: "doctor@example.invalid",
    role: "user",
  });
  const firstPayload = await auth.verifyToken(first.accessToken);
  if (
    !firstPayload
    || typeof firstPayload.userId !== "string"
    || typeof firstPayload.sessionId !== "string"
  ) {
    throw new Error("Access-token issuance or signature verification failed");
  }
  if (!(await auth.verifyActiveToken(first.accessToken))) {
    throw new Error("Fresh access token is not backed by an active session");
  }

  const jwks = auth.getJwks();
  if (
    !Array.isArray(jwks.keys)
    || jwks.keys.length !== 1
    || jwks.keys.some((key) => "d" in key)
  ) {
    throw new Error("Public JWKS contains missing or private key material");
  }

  const rotated = await auth.refreshToken(first.refreshToken);
  if (
    !rotated.refreshToken
    || !(await auth.verifyActiveToken(rotated.accessToken))
  ) {
    throw new Error("Refresh rotation did not issue an active token pair");
  }
  if (!(await rejects(auth.refreshToken(first.refreshToken)))) {
    throw new Error("Replayed refresh token was accepted");
  }

  const concurrent = await auth.issueTokens({
    userId: `doctor-concurrent-${randomUUID()}`,
    email: "doctor-concurrent@example.invalid",
  });
  const competing = await Promise.allSettled([
    auth.refreshToken(concurrent.refreshToken),
    auth.refreshToken(concurrent.refreshToken),
  ]);
  if (
    competing.filter((result) => result.status === "fulfilled").length !== 1
    || competing.filter((result) => result.status === "rejected").length !== 1
  ) {
    throw new Error("Concurrent refresh attempts did not fail closed");
  }

  const revocable = await auth.issueTokens({
    userId: `doctor-revoke-${randomUUID()}`,
    email: "doctor-revoke@example.invalid",
  });
  const revocablePayload = await auth.verifyToken(revocable.accessToken);
  if (
    !revocablePayload
    || typeof revocablePayload.userId !== "string"
    || typeof revocablePayload.sessionId !== "string"
  ) {
    throw new Error("Revocation fixture did not contain a session identity");
  }
  await auth.revokeSession(
    revocablePayload.userId,
    revocablePayload.sessionId,
  );
  if (await auth.verifyActiveToken(revocable.accessToken)) {
    throw new Error("Revoked access session remained active");
  }
  if (!(await rejects(auth.refreshToken(revocable.refreshToken)))) {
    throw new Error("Revoked refresh session remained active");
  }

  const foreignKid = `doctor-foreign-${randomUUID()}`;
  const foreignAuth = await core.createAuthenik8({
    jwt: {
      keys: [await core.generateSigningJwk(foreignKid)],
      activeKid: foreignKid,
      issuer,
      audience,
    },
    refreshSecret: randomBytes(48).toString("base64url"),
    redis,
    redisKeyPrefix: `${namespace}:foreign`,
    security: {
      rateLimiterEnabled: false,
      whiteListEnabled: false,
      helmetEnabled: false,
    },
  });
  if (await foreignAuth.verifyToken(first.accessToken)) {
    throw new Error("A token with an untrusted signature was accepted");
  }
}

async function cleanupRedis(redis: RedisLike, namespace: string): Promise<void> {
  try {
    const keys = await redis.keys(`${namespace}:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Preserve the actionable capability failure when cleanup is unavailable.
  } finally {
    if (redis.disconnect) redis.disconnect();
    else await redis.quit?.();
  }
}

export async function runDeepChecks(
  context: DoctorContext,
): Promise<DoctorCheck[]> {
  const namespace = `authenik8:doctor:${randomUUID()}`;
  let redis: RedisLike;
  try {
    redis = createRedis(context);
  } catch (error) {
    const detail = safeError(error);
    return [
      check(
        "A8-REDIS-002",
        "Redis capabilities",
        "fail",
        `Could not create the isolated Redis client: ${detail}`,
        "Install the generated dependencies and restore the configured Redis service.",
      ),
      check(
        "A8-CORE-002",
        "Identity engine runtime",
        "skip",
        "Core runtime checks require the Redis capability prerequisite",
      ),
    ];
  }

  try {
    try {
      await verifyRedisCapabilities(redis, namespace);
    } catch (error) {
      return [
        check(
          "A8-REDIS-002",
          "Redis capabilities",
          "fail",
          `Redis capability check failed: ${safeError(error)}`,
          "Verify Redis connectivity and support for expiry, NX locks, and atomic consume operations.",
        ),
        check(
          "A8-CORE-002",
          "Identity engine runtime",
          "skip",
          "Core runtime checks require the Redis capability prerequisite",
        ),
      ];
    }

    const checks: DoctorCheck[] = [
      check(
        "A8-REDIS-002",
        "Redis capabilities",
        "pass",
        `Isolated Redis operations passed in ${namespace}`,
      ),
    ];
    try {
      await verifyCoreRuntime(context, redis, namespace);
      checks.push(check(
        "A8-CORE-002",
        "Identity engine runtime",
        "pass",
        "Installed core passed issuance, verification, rotation, replay, concurrency, revocation, signature, and JWKS checks",
      ));
    } catch (error) {
      checks.push(check(
        "A8-CORE-002",
        "Identity engine runtime",
        "fail",
        `Installed core runtime check failed: ${safeError(error)}`,
        "Restore the exact supported authenik8-core installation and rerun Doctor.",
      ));
    }
    return checks;
  } finally {
    await cleanupRedis(redis, namespace);
  }
}
