import net from "node:net";
import tls from "node:tls";

import type { EnvironmentValues, RedisEndpoint, RedisProbe } from "./types.js";

function redisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

export function redisProbePayload(endpoint: RedisEndpoint): string {
  const commands: string[] = [];
  if (endpoint.password) {
    commands.push(redisCommand(endpoint.username
      ? ["AUTH", endpoint.username, endpoint.password]
      : ["AUTH", endpoint.password]));
  }
  commands.push(redisCommand(["PING"]));
  return commands.join("");
}

export const probeRedis: RedisProbe = (endpoint) => new Promise((resolve, reject) => {
  let settled = false;
  let response = "";
  const connectionOptions = { host: endpoint.host, port: endpoint.port };
  const socket = endpoint.tls
    ? tls.connect({ ...connectionOptions, servername: net.isIP(endpoint.host) ? undefined : endpoint.host })
    : net.createConnection(connectionOptions);

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    if (error) reject(error);
    else resolve();
  };

  socket.setTimeout(2_000);
  socket.once("error", (error) => finish(error));
  socket.once("timeout", () => finish(new Error("connection timed out")));
  socket.once("close", () => finish(new Error("connection closed before Redis answered PING")));
  socket.on("data", (chunk) => {
    response += chunk.toString("utf8");
    if (response.includes("-")) {
      const redisError = response.split("\r\n").find((line) => line.startsWith("-"));
      if (redisError) finish(new Error(redisError.slice(1)));
      return;
    }
    if (response.includes("+PONG\r\n")) finish();
  });
  socket.once(endpoint.tls ? "secureConnect" : "connect", () => {
    socket.write(redisProbePayload(endpoint));
  });
});

export function redisEndpointFromEnv(
  env: EnvironmentValues,
  fullstack: boolean,
): RedisEndpoint {
  if (fullstack) {
    const source = env.REDIS_URL?.trim() || "memory://";
    if (source === "memory://") {
      throw new Error("memory Redis does not have a network endpoint");
    }
    const url = new URL(source);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use redis:// or rediss://");
    }

    return {
      host: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : 6379,
      tls: url.protocol === "rediss:",
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    };
  }

  const port = Number(env.REDIS_PORT?.trim() || "6379");
  return {
    host: env.REDIS_HOST?.trim() || "127.0.0.1",
    port,
    tls: false,
    ...(env.REDIS_PASSWORD?.trim() ? { password: env.REDIS_PASSWORD.trim() } : {}),
  };
}
