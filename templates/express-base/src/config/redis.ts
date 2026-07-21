import Redis, { type Redis as RedisClient } from "ioredis";

const localRedisUrl = "memory://";
const redisOptions = {
  connectTimeout: 5_000,
  enableReadyCheck: true,
  maxRetriesPerRequest: 2,
};

function externalRedisUrl(source: string): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("REDIS_URL must be memory://, redis://, or rediss://");
  }

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must be memory://, redis://, or rediss://");
  }

  return source;
}

function redisPort(): number {
  const port = Number(process.env.REDIS_PORT?.trim() || "6379");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("REDIS_PORT must be an integer from 1 to 65535");
  }
  return port;
}

function waitForRedis(client: RedisClient): Promise<RedisClient> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let readinessCheckStarted = false;
    const cleanup = () => {
      client.off("ready", handleReady);
      client.off("error", handleError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        client.disconnect();
        reject(error);
      } else {
        resolve(client);
      }
    };
    const handleReady = () => {
      if (readinessCheckStarted) return;
      readinessCheckStarted = true;
      void client.ping().then(() => finish(), (error: Error) => finish(error));
    };
    const handleError = (error: Error) => finish(error);

    client.once("ready", handleReady);
    client.once("error", handleError);
    if (client.status === "ready") handleReady();
  });
}

export async function createRedisClient(): Promise<RedisClient> {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl === localRedisUrl) {
    if (process.env.NODE_ENV?.trim() === "production") {
      throw new Error(
        "REDIS_URL=memory:// is for local development only; use redis:// or rediss:// in production",
      );
    }

    const { default: RedisMock } = await import("ioredis-mock");
    return new RedisMock() as unknown as RedisClient;
  }

  if (redisUrl) {
    return waitForRedis(new Redis(externalRedisUrl(redisUrl), redisOptions));
  }

  return waitForRedis(new Redis({
    ...redisOptions,
    host: process.env.REDIS_HOST?.trim() || "127.0.0.1",
    port: redisPort(),
    ...(process.env.REDIS_PASSWORD?.trim()
      ? { password: process.env.REDIS_PASSWORD.trim() }
      : {}),
  }));
}
