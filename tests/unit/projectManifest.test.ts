import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";

import {
  PROJECT_MANIFEST_FILENAME,
  projectManifestSchema,
  readProjectManifest,
  writeProjectManifest,
} from "../../src/lib/projectManifest.js";

const temporaryDirectories: string[] = [];

async function projectDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-manifest-"));
  temporaryDirectories.push(directory);
  await fs.writeJson(path.join(directory, "package.json"), {
    name: "demo-app",
    dependencies: { "authenik8-core": "2.0.3" },
  });
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.remove(directory)));
});

describe("project manifest", () => {
  it("writes a deterministic, secret-free manifest atomically", async () => {
    const directory = await projectDirectory();
    const manifest = await writeProjectManifest(directory, {
      projectName: "demo-app",
      generatorVersion: "2.4.4",
      preset: "auth-oauth",
      packageManager: "pnpm",
      runtime: "node",
      database: "sqlite",
      usePrisma: true,
      oauthProviders: ["github"],
      productionReady: false,
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      engine: { package: "authenik8-core", version: "2.0.3" },
      features: { prisma: true, oauthProviders: ["github"], pm2: false },
    });
    const source = await fs.readFile(path.join(directory, PROJECT_MANIFEST_FILENAME), "utf8");
    expect(source).not.toMatch(/secret|signing|clientId|clientSecret/i);
    expect((await fs.readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(await readProjectManifest(directory)).toEqual({ status: "valid", manifest });
  });

  it("rejects internally inconsistent preset metadata", () => {
    expect(() => projectManifestSchema.parse({
      schemaVersion: 1,
      projectName: "demo-app",
      generatedBy: { package: "create-authenik8-app", version: "2.4.4" },
      engine: { package: "authenik8-core", version: "2.0.3" },
      preset: "fullstack",
      packageManager: "npm",
      runtime: "node",
      database: "sqlite",
      features: { prisma: true, oauthProviders: [], pm2: false },
    })).toThrow();
  });

  it("reports malformed files without returning their contents", async () => {
    const directory = await projectDirectory();
    await fs.writeFile(path.join(directory, PROJECT_MANIFEST_FILENAME), "{privateSigningKey");
    expect(await readProjectManifest(directory)).toEqual({
      status: "invalid",
      message: "authenik8.json is not valid JSON",
    });
  });
});
