import net from "node:net";
import path from "node:path";
import http from "node:http";
import { describe, expect, it } from "vitest";

import {
  DoctorUsageError,
  parseDoctorArguments,
} from "../../src/commands/doctor/index.js";
import {
  redisProbePayload,
  redisEndpointFromEnv,
} from "../../src/commands/doctor/services.js";
import { verifyLocalApiResponsiveness } from "../../src/commands/doctor/deep.js";
import type { DoctorContext } from "../../src/commands/doctor/types.js";

describe("doctor arguments", () => {
  it("resolves a directory and machine-readable service options", () => {
    expect(parseDoctorArguments(["project", "--json", "--skip-services"], "/tmp/work")).toEqual({
      directory: path.resolve("/tmp/work/project"),
      json: true,
      skipServices: true,
      deep: false,
      production: false,
      fix: false,
      dryRun: false,
      ci: false,
      strict: false,
      report: false,
      offline: false,
      help: false,
    });
  });

  it("rejects unknown options and multiple directories", () => {
    expect(() => parseDoctorArguments(["--write"])).toThrow(DoctorUsageError);
    expect(() => parseDoctorArguments(["one", "two"])).toThrow("at most one");
  });

  it("parses documented modes and validates stable diagnostic IDs", () => {
    expect(parseDoctorArguments([
      "--ci",
      "--offline",
      "--strict",
      "--check",
      "A8-JWK-006",
    ], "/tmp/work")).toMatchObject({
      ci: true,
      offline: true,
      strict: true,
      checkId: "A8-JWK-006",
    });
    expect(parseDoctorArguments(["--check", "A8-CORE-002"])).toMatchObject({
      checkId: "A8-CORE-002",
      deep: true,
    });
    expect(parseDoctorArguments(["--check", "A8-DEV-001"])).toMatchObject({
      checkId: "A8-DEV-001",
      deep: true,
    });
    expect(parseDoctorArguments(["--production"])).toMatchObject({
      production: true,
      deep: true,
    });
    expect(() => parseDoctorArguments(["--check", "A8-NOT-REAL"]))
      .toThrow("Unknown diagnostic ID");
    expect(() => parseDoctorArguments(["--dry-run"]))
      .toThrow("--dry-run requires --fix");
    expect(() => parseDoctorArguments(["--offline", "--deep"]))
      .toThrow("cannot be combined");
    expect(() => parseDoctorArguments([
      "--offline",
      "--check",
      "A8-CORE-002",
    ])).toThrow("cannot be combined");
  });
});

describe("Redis diagnostics", () => {
  it("derives engine-compatible Express and fullstack endpoints", () => {
    expect(redisEndpointFromEnv({ REDIS_HOST: "cache", REDIS_PORT: "6380" }, false)).toEqual({
      host: "cache",
      port: 6380,
      tls: false,
    });
    expect(redisEndpointFromEnv({ REDIS_URL: "rediss://agent:secret@cache.example:6381" }, true)).toEqual({
      host: "cache.example",
      port: 6381,
      tls: true,
      username: "agent",
      password: "secret",
    });
    expect(() => redisEndpointFromEnv({}, true)).toThrow("memory Redis");
    expect(redisEndpointFromEnv({ REDIS_PORT: "6379oops" }, false).port).toBeNaN();
  });

  it("builds an authenticated RESP PING instead of only opening a socket", () => {
    const request = redisProbePayload({
      host: "127.0.0.1",
      port: 6379,
      tls: false,
      password: "test-password",
    });

    expect(request).toContain("AUTH");
    expect(request).toContain("test-password");
    expect(request).toContain("PING");
  });
});

describe("local API responsiveness diagnostics", () => {
  const bindEphemeralPort = (): Promise<number> => {
    return new Promise((resolve, reject) => {
      const bootstrap = net.createServer();
      bootstrap.listen(0, "127.0.0.1", () => {
        const address = bootstrap.address() as net.AddressInfo;
        bootstrap.close(() => resolve(address.port));
      });
      bootstrap.once("error", reject);
    });
  };

  const doctorContext = (port: string) =>
  ({
    rootDir: "/tmp/fixture-project",
    appDir: path.join("/tmp/fixture-project", "apps", "api"),
    preset: "fullstack",
    packageManager: "npm",
    packageJson: {},
    appPackageJson: {},
    env: port === "" ? {} : { PORT: port },
    envSource: ".env",
    oauthProviders: [],
    usesPrisma: true,
    manifest: { status: "missing" },
  }) as unknown as DoctorContext;

  it("passes when the local API answers the health endpoint", async () => {
    const port = await bindEphemeralPort();
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"ok"}');
    });
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    try {
      const result = await verifyLocalApiResponsiveness(doctorContext(String(port)));
      expect(result).toMatchObject({
        id: "A8-DEV-001",
        status: "pass",
      });
      expect(result.message).toContain(`127.0.0.1:${port}`);
      expect(result.message).toContain("HTTP 200");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("counts any HTTP status from the listener as responsive", async () => {
    const port = await bindEphemeralPort();
    const server = http.createServer((_request, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"error":"not found"}');
    });
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    try {
      const result = await verifyLocalApiResponsiveness(doctorContext(String(port)), 300);
      expect(result.status).toBe("pass");
      expect(result.message).toContain("HTTP 404");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("skips when nothing is listening on the configured port", async () => {
    const port = await bindEphemeralPort();
    const result = await verifyLocalApiResponsiveness(doctorContext(String(port)), 300);
    expect(result).toMatchObject({
      id: "A8-DEV-001",
      status: "skip",
    });
    expect(result.message).toContain(`127.0.0.1:${port}`);
  });

  it("fails when a listener accepts connections without answering", async () => {
    const port = await bindEphemeralPort();
    const sockets = new Set<net.Socket>();
    const frozen = net.createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((resolve) => frozen.listen(port, "127.0.0.1", resolve));
    try {
      const result = await verifyLocalApiResponsiveness(doctorContext(String(port)), 400);
      expect(result).toMatchObject({
        id: "A8-DEV-001",
        status: "fail",
      });
      expect(result.message).toContain(`127.0.0.1:${port}`);
      expect(result.message).toContain("did not send response headers");
      expect(result.fix).toContain("scripts/run-local.mjs");
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => frozen.close(() => resolve()));
    }
  });

  it("fails closed when the listener resets connections", async () => {
    const port = await bindEphemeralPort();
    const resetter = net.createServer((socket) => {
      socket.destroy();
    });
    await new Promise<void>((resolve) => resetter.listen(port, "127.0.0.1", resolve));
    try {
      const result = await verifyLocalApiResponsiveness(doctorContext(String(port)), 300);
      expect(result.status).toBe("fail");
      expect(result.fix).toContain("Restart the development stack");
    } finally {
      await new Promise<void>((resolve) => resetter.close(() => resolve()));
    }
  });

  it("skips without attempting a probe when PORT is not a valid port", async () => {
    const invalid = await verifyLocalApiResponsiveness(doctorContext("3000oops"), 300);
    expect(invalid).toMatchObject({
      id: "A8-DEV-001",
      status: "skip",
    });
    expect(invalid.message).toContain("3000oops");
  });

  it("does not probe ports outside the valid TCP range", async () => {
    const oversized = await verifyLocalApiResponsiveness(doctorContext("70000"), 300);
    expect(oversized.status).toBe("skip");
    const negative = await verifyLocalApiResponsiveness(doctorContext("-1"), 300);
    expect(negative.status).toBe("skip");
  });
});
