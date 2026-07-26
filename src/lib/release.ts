import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthMode } from "./types.js";

export type ToolRelease = {
  rootDir: string;
  generatorVersion: string;
  engineVersion: string;
};

type PackageMetadata = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function packageMetadata(filename: string): PackageMetadata {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as PackageMetadata;
}

function releaseRoot(): string {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(directory, "../../.."),
    path.resolve(directory, "../.."),
  ];
  const root = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "package.json"))
    && fs.existsSync(path.join(candidate, "templates"))
  );
  if (!root) throw new Error("Could not locate the create-authenik8-app release root");
  return root;
}

export function currentToolRelease(): ToolRelease {
  const rootDir = releaseRoot();
  const metadata = packageMetadata(path.join(rootDir, "package.json"));
  const generatorVersion = metadata.version?.trim();
  const engineVersion = metadata.devDependencies?.["authenik8-core"]?.trim();
  if (!generatorVersion || !engineVersion) {
    throw new Error("The CLI release metadata is missing its generator or authenik8-core version");
  }
  return { rootDir, generatorVersion, engineVersion };
}

export function templateEngineVersion(preset: AuthMode): string {
  const release = currentToolRelease();
  const packagePath = preset === "fullstack"
    ? path.join(release.rootDir, "templates/fullstack/apps/api/package.json")
    : path.join(
      release.rootDir,
      "templates",
      preset === "base"
        ? "express-base"
        : preset === "auth"
          ? "express-auth"
          : "express-auth+",
      "package.json",
    );
  const metadata = packageMetadata(packagePath);
  const version = metadata.dependencies?.["authenik8-core"]?.trim()
    ?? metadata.devDependencies?.["authenik8-core"]?.trim();
  if (!version) throw new Error(`The ${preset} template does not declare authenik8-core`);
  if (version !== release.engineVersion) {
    throw new Error(
      `Release metadata drift: ${preset} targets authenik8-core ${version}, expected ${release.engineVersion}`,
    );
  }
  return version;
}
