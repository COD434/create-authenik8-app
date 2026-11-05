import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { PROJECT_MANIFEST_FILENAME, projectManifestV1Schema, readManifestSnapshot } from "../src/manifest.js";

const fixtureSource = readFileSync(new URL("./fixtures/demo-authenik8.json", import.meta.url), "utf8");
const fixtureManifest = JSON.parse(fixtureSource) as Record<string, unknown>;

const tempDirs: Array<string> = [];
function makeProjectDir(manifest: unknown | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), "authenik8-mcp-manifest-"));
  tempDirs.push(dir);
  if (manifest !== null) writeFileSync(path.join(dir, PROJECT_MANIFEST_FILENAME), JSON.stringify(manifest, null, 2));
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("manifest contract (mirrored v1 schema)", () => {
  it("accepts a manifest produced by a real generation", () => {
    expect(projectManifestV1Schema.safeParse(fixtureManifest).success).toBe(true);
    expect(readManifestSnapshot(makeProjectDir(fixtureManifest)).status).toBe("valid");
  });

  it("rejects manifest contract violations with a first-issue message", () => {
    const cases: Array<[Record<string, unknown>, string | RegExp]> = [
      [
        { ...fixtureManifest, packageManager: "pnpm" },
        "fullstack requires npm workspaces",
      ],
      [
        { ...fixtureManifest, features: { ...fixtureManifest.features as object, pm2: true } },
        "PM2 generation only applies to Express presets",
      ],
      [
        { ...fixtureManifest, preset: "auth-oauth", features: { prisma: true, oauthProviders: [], pm2: false } },
        "the auth-oauth preset requires an OAuth provider",
      ],
      [
        { ...fixtureManifest, preset: "auth", features: { prisma: true, oauthProviders: ["google"], pm2: false } },
        "the auth preset does not include OAuth providers",
      ],
      [
        { ...fixtureManifest, database: "sqlite" },
        "fullstack requires PostgreSQL",
      ],
      [
        { ...fixtureManifest, schemaVersion: 2 },
        /schemaVersion/,
      ],
      [
        { ...fixtureManifest, unexpectedKey: true },
        /unexpectedKey/,
      ],
    ];
    for (const [manifest, expectedMessage] of cases) {
      const result = readManifestSnapshot(makeProjectDir(manifest));
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") {
        expect(result.message).toMatch(expectedMessage);
        expect(result.message).toContain(PROJECT_MANIFEST_FILENAME);
      }
    }
  });

  it("enforces the base preset's null-database pairing rule", () => {
    const baseOk = {
      schemaVersion: 1,
      projectName: "plain",
      generatedBy: { package: "create-authenik8-app", version: "2.4.4" },
      engine: { package: "authenik8-core", version: "2.0.7" },
      preset: "base",
      packageManager: "npm",
      runtime: "node",
      database: null,
      features: { prisma: false, oauthProviders: [], pm2: false },
    };
    expect(readManifestSnapshot(makeProjectDir(baseOk)).status).toBe("valid");

    const mismatched = {
      ...baseOk,
      database: "postgresql",
      features: { prisma: false, oauthProviders: [], pm2: false },
    };
    const result = readManifestSnapshot(makeProjectDir(mismatched));
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toContain("database must be null exactly when Prisma is disabled");
    }
  });

  it("reports missing and unreadable manifests without throwing", () => {
    expect(readManifestSnapshot(makeProjectDir(null)).status).toBe("missing");
  });

  it("reports invalid JSON as invalid", () => {
    const dir = makeProjectDir(null);
    writeFileSync(path.join(dir, PROJECT_MANIFEST_FILENAME), "{ not json");
    const result = readManifestSnapshot(dir);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toContain("not valid JSON");
    }
  });
});
