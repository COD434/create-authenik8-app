import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DoctorUsageError,
  parseDoctorArguments,
} from "../../src/commands/doctor/index.js";
import {
  redisProbePayload,
  redisEndpointFromEnv,
} from "../../src/commands/doctor/services.js";

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
