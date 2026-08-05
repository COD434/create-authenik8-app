import http from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { projectManifestSchema } from "../../src/lib/projectManifest.js";
import {
  parseStudioArguments,
  StudioUsageError,
} from "../../src/commands/studio/index.js";
import {
  formatStudioStarted,
  studioHelp,
} from "../../src/commands/studio/output.js";
import {
  createStudioSnapshot,
  StudioProjectError,
  type StudioSnapshotSources,
} from "../../src/commands/studio/snapshot.js";
import { startStudioServer } from "../../src/commands/studio/server.js";
import type { StudioServer } from "../../src/commands/studio/types.js";
import type { DoctorReport } from "../../src/commands/doctor/types.js";
import type { UpgradePlan } from "../../src/commands/upgrade/types.js";

const openServers: StudioServer[] = [];

const manifest = projectManifestSchema.parse({
  schemaVersion: 1,
  projectName: "studio-app",
  generatedBy: { package: "create-authenik8-app", version: "2.4.4" },
  engine: { package: "authenik8-core", version: "2.0.7" },
  preset: "auth-oauth",
  packageManager: "npm",
  runtime: "node",
  database: "postgresql",
  features: {
    prisma: true,
    oauthProviders: ["github"],
    pm2: false,
  },
});

const doctor: DoctorReport = {
  schemaVersion: 1,
  rootDir: "/tmp/studio-app",
  preset: "auth-oauth",
  mode: "offline",
  checks: [
    {
      id: "A8-PROJECT-002",
      label: "Project manifest",
      status: "pass",
      message: "Manifest matches the detected project",
    },
    {
      id: "A8-JWT-001",
      label: "Token claims",
      status: "fail",
      message: "Audience is missing",
      impact: "Tokens could cross service boundaries.",
      remediation: "Set a stable audience.",
      verification: "npx create-authenik8-app@latest doctor --check A8-JWT-001",
    },
    {
      id: "A8-REDIS-002",
      label: "Redis capabilities",
      status: "skip",
      message: "Offline mode did not contact Redis",
    },
  ],
  summary: {
    passed: 1,
    warnings: 0,
    failed: 1,
    skipped: 1,
  },
};

const upgrade: UpgradePlan = {
  schemaVersion: 1,
  rootDir: "/tmp/studio-app",
  preset: "auth-oauth",
  status: "current",
  versions: {
    generator: { project: "2.4.4", target: "2.4.4" },
    engine: {
      manifest: "2.0.7",
      declared: "2.0.7",
      installed: "2.0.7",
      target: "2.0.7",
    },
  },
  actions: [],
};

function sources(): StudioSnapshotSources {
  return {
    readManifest: async () => ({ status: "valid", manifest }),
    runDoctor: async () => doctor,
    runUpgrade: async () => upgrade,
    now: () => new Date("2026-07-29T10:00:00.000Z"),
  };
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
});

describe("Studio arguments", () => {
  it("uses a Prisma-Studio-style opt-in command contract", () => {
    expect(
      parseStudioArguments(
        ["project", "--port", "6001", "--no-open"],
        "/tmp/work",
      ),
    ).toEqual({
      directory: path.resolve("/tmp/work/project"),
      port: 6001,
      openBrowser: false,
      help: false,
    });
  });

  it("rejects unsafe ports, unknown options, and multiple directories", () => {
    expect(() => parseStudioArguments(["--port", "0"])).toThrow(StudioUsageError);
    expect(() => parseStudioArguments(["--host", "0.0.0.0"])).toThrow(
      "Unknown Studio option",
    );
    expect(() => parseStudioArguments(["one", "two"])).toThrow("at most one");
  });

  it("describes point-in-time behavior in both help and startup output", () => {
    expect(studioHelp()).toContain("local, read-only security dashboard");
    const output = formatStudioStarted("http://127.0.0.1:5558", {
      directory: "/tmp/studio-app",
      port: 5558,
      openBrowser: false,
      help: false,
    });
    expect(output).toContain("point-in-time, offline, and read-only");
    expect(output).toContain("stop and rerun Studio");
  });
});

describe("Studio snapshot", () => {
  it("combines manifest, Doctor, and upgrade contracts without secret fields", async () => {
    const snapshot = await createStudioSnapshot("/tmp/studio-app", sources());

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-07-29T10:00:00.000Z",
      project: {
        name: "studio-app",
        preset: "auth-oauth",
        versions: { generator: "2.4.4", engine: "2.0.7" },
      },
      scan: {
        mode: "offline",
      },
      posture: {
        status: "action-required",
      },
      drift: {
        status: "clear",
      },
      productionReadiness: {
        status: "not-assessed",
      },
      nextAction: {
        label: "Resolve A8-JWT-001",
      },
    });
    expect(snapshot.capabilities.map((capability) => capability.id)).toEqual([
      "preset",
      "sessions",
      "prisma",
      "oauth-github",
    ]);
    expect(snapshot.findings).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /password|private.?key|client.?secret/i,
    );
  });

  it("requires a valid source-controlled project manifest", async () => {
    const missingSources = {
      ...sources(),
      readManifest: async () => ({ status: "missing" as const }),
    };
    await expect(
      createStudioSnapshot("/tmp/legacy-app", missingSources),
    ).rejects.toThrow(StudioProjectError);
  });
});

describe("Studio server", () => {
  it("serves one immutable snapshot with browser security headers", async () => {
    const snapshot = await createStudioSnapshot("/tmp/studio-app", sources());
    const server = await startStudioServer(snapshot, { port: 0 });
    openServers.push(server);

    const response = await fetch(`${server.url}/api/snapshot`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-opener-policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    await expect(response.json()).resolves.toMatchObject({
      project: { name: "studio-app" },
    });

    const html = await fetch(server.url);
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await html.text()).toContain("Authenik8 Studio");

    const [javascript, stylesheet] = await Promise.all([
      fetch(`${server.url}/assets/app.js`),
      fetch(`${server.url}/assets/app.css`),
    ]);
    expect(javascript.headers.get("content-type")).toContain("text/javascript");
    expect(await javascript.text()).toContain("data-studio-ui");
    expect(stylesheet.headers.get("content-type")).toContain("text/css");
    expect(await stylesheet.text()).toContain("--auth-mint");
  });

  it("rejects non-loopback Host headers and mutating methods", async () => {
    const snapshot = await createStudioSnapshot("/tmp/studio-app", sources());
    const server = await startStudioServer(snapshot, { port: 0 });
    openServers.push(server);
    const address = new URL(server.url);

    const forbiddenStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const request = http.request(
          {
            hostname: address.hostname,
            port: address.port,
            path: "/",
            headers: { Host: "attacker.example" },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.once("error", reject);
        request.end();
      },
    );
    expect(forbiddenStatus).toBe(403);

    const mutation = await fetch(`${server.url}/api/snapshot`, {
      method: "POST",
    });
    expect(mutation.status).toBe(405);
    expect(mutation.headers.get("allow")).toBe("GET, HEAD");

    const [missingPort, absoluteTarget] = await Promise.all([
      new Promise<number | undefined>((resolve, reject) => {
        const request = http.request(
          {
            hostname: address.hostname,
            port: address.port,
            path: "/",
            headers: { Host: "localhost" },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.once("error", reject);
        request.end();
      }),
      new Promise<number | undefined>((resolve, reject) => {
        const request = http.request(
          {
            hostname: address.hostname,
            port: address.port,
            path: "http://127.0.0.1/",
            headers: { Host: address.host },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.once("error", reject);
        request.end();
      }),
    ]);
    expect(missingPort).toBe(403);
    expect(absoluteTarget).toBe(400);
  });
});
