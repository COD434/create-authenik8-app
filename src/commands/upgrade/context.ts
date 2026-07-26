import path from "node:path";
import fs from "fs-extra";

import { readProjectManifest } from "../../lib/projectManifest.js";
import { currentToolRelease, templateEngineVersion } from "../../lib/release.js";
import type { UpgradeContext } from "./types.js";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export class UpgradeProjectError extends Error {}

function dependencyVersion(packageJson: PackageJson, name: string): string | undefined {
  return packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
}

export async function createUpgradeContext(directory: string): Promise<UpgradeContext> {
  const rootDir = path.resolve(directory);
  const manifestResult = await readProjectManifest(rootDir);
  if (manifestResult.status === "missing") {
    throw new UpgradeProjectError(
      "authenik8.json is required for version-aware upgrades. Legacy projects must be migrated explicitly.",
    );
  }
  if (manifestResult.status === "invalid") throw new UpgradeProjectError(manifestResult.message);
  const manifest = manifestResult.manifest;
  const appDir = manifest.preset === "fullstack" ? path.join(rootDir, "apps/api") : rootDir;
  const packagePath = path.join(appDir, "package.json");
  if (!(await fs.pathExists(packagePath))) {
    throw new UpgradeProjectError(`Required package file is missing: ${path.relative(rootDir, packagePath)}`);
  }
  const packageJson = await fs.readJson(packagePath) as PackageJson;
  const declaredEngineVersion = dependencyVersion(packageJson, "authenik8-core")?.trim();
  if (!declaredEngineVersion) {
    throw new UpgradeProjectError("The generated application does not declare authenik8-core.");
  }

  const installedCandidates = [
    path.join(appDir, "node_modules/authenik8-core/package.json"),
    path.join(rootDir, "node_modules/authenik8-core/package.json"),
  ];
  let installedEngineVersion: string | undefined;
  for (const candidate of installedCandidates) {
    if (!(await fs.pathExists(candidate))) continue;
    try {
      installedEngineVersion = ((await fs.readJson(candidate)) as { version?: string }).version?.trim();
    } catch {
      throw new UpgradeProjectError("Installed authenik8-core package metadata is unreadable.");
    }
    break;
  }

  const release = currentToolRelease();
  return {
    rootDir,
    appDir,
    manifest,
    packageManager: manifest.packageManager,
    declaredEngineVersion,
    ...(installedEngineVersion ? { installedEngineVersion } : {}),
    targetGeneratorVersion: release.generatorVersion,
    targetEngineVersion: templateEngineVersion(manifest.preset),
  };
}
