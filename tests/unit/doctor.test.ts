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
      help: false,
    });
  });

  it("rejects unknown options and multiple directories", () => {
    expect(() => parseDoctorArguments(["--write"])).toThrow(DoctorUsageError);
    expect(() => parseDoctorArguments(["one", "two"])).toThrow("at most one");
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
