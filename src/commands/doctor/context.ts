import fs from "fs-extra";
import path from "node:path";
import { parseEnv } from "node:util";

import { supportedOAuthProviders, type OAuthProvider } from "../../lib/oauth.js";
import { readProjectManifest } from "../../lib/projectManifest.js";
import type {
  DoctorContext,
  DoctorPackageManager,
  DoctorPreset,
  PackageJson,
} from "./types.js";

export class DoctorProjectError extends Error {}

function dependency(packageJson: PackageJson, name: string): string | undefined {
  return packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
}

async function readPackageJson(filename: string): Promise<PackageJson> {
  try {
    return await fs.readJson(filename) as PackageJson;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DoctorProjectError(`Could not read ${filename}: ${detail}`);
  }
}

async function detectPackageManager(
  rootDir: string,
  packageJson: PackageJson,
  manifestPackageManager?: DoctorPackageManager,
): Promise<DoctorPackageManager> {
  if (await fs.pathExists(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm";
  if (await fs.pathExists(path.join(rootDir, "pnpm-workspace.yaml"))) return "pnpm";
  if (
    await fs.pathExists(path.join(rootDir, "bun.lock")) ||
    await fs.pathExists(path.join(rootDir, "bun.lockb")) ||
    Array.isArray(packageJson.trustedDependencies)
  ) {
    return "bun";
  }
  return manifestPackageManager ?? "npm";
}

function parseExpressProviders(source: string): OAuthProvider[] {
  const matches = [...source.matchAll(/router\.get\("\/(google|github)(?:\/|\")/g)];
  const providers = matches
    .map((match) => match[1])
    .filter((provider): provider is string => typeof provider === "string");
  return supportedOAuthProviders([...new Set(providers)]);
}

function parseFullstackProviders(source: string): OAuthProvider[] {
  const arraySource = source.match(/enabledOAuthProviders[^=]*=\s*(\[[^;]*\])/s)?.[1];
  if (!arraySource) return [];

  try {
    const providers = JSON.parse(arraySource) as unknown;
    return Array.isArray(providers)
      ? supportedOAuthProviders(providers.filter((value): value is string => typeof value === "string"))
      : [];
  } catch {
    return [];
  }
}

async function readOAuthProviders(rootDir: string, preset: DoctorPreset): Promise<OAuthProvider[]> {
  const filename = preset === "fullstack"
    ? path.join(rootDir, "apps/web/src/auth/providers.ts")
    : path.join(rootDir, "src/auth/routes/oauth.routes.ts");

  if (!(await fs.pathExists(filename))) return [];
  const source = await fs.readFile(filename, "utf8");
  return preset === "fullstack"
    ? parseFullstackProviders(source)
    : parseExpressProviders(source);
}

async function detectPreset(
  rootDir: string,
  rootPackage: PackageJson,
): Promise<{ preset: DoctorPreset; appDir: string; appPackageJson: PackageJson }> {
  const apiPackagePath = path.join(rootDir, "apps/api/package.json");
  const fullstackServerPath = path.join(rootDir, "apps/api/src/server.ts");

  if (
    Array.isArray(rootPackage.workspaces) &&
    await fs.pathExists(apiPackagePath) &&
    await fs.pathExists(fullstackServerPath)
  ) {
    const appDir = path.join(rootDir, "apps/api");
    const appPackageJson = await readPackageJson(apiPackagePath);
    if (!dependency(appPackageJson, "authenik8-core")) {
      throw new DoctorProjectError("The API workspace does not declare authenik8-core.");
    }
    return { preset: "fullstack", appDir, appPackageJson };
  }

  if (
    dependency(rootPackage, "authenik8-core") &&
    await fs.pathExists(path.join(rootDir, "src/server.ts"))
  ) {
    const oauthRoutes = path.join(rootDir, "src/auth/routes/oauth.routes.ts");
    const authRoutes = path.join(rootDir, "src/routes/auth.routes.ts");
    const preset: DoctorPreset = await fs.pathExists(oauthRoutes)
      ? "auth-oauth"
      : await fs.pathExists(authRoutes)
        ? "auth"
        : "base";
    return { preset, appDir: rootDir, appPackageJson: rootPackage };
  }

  throw new DoctorProjectError(
    "This directory is not a recognized Authenik8 project. Run doctor from the generated project root.",
  );
}

export async function createDoctorContext(directory: string): Promise<DoctorContext> {
  const rootDir = path.resolve(directory);
  const rootPackagePath = path.join(rootDir, "package.json");
  if (!(await fs.pathExists(rootPackagePath))) {
    throw new DoctorProjectError(`No package.json found in ${rootDir}.`);
  }

  const packageJson = await readPackageJson(rootPackagePath);
  const manifest = await readProjectManifest(rootDir);
  const { preset, appDir, appPackageJson } = await detectPreset(rootDir, packageJson);
  const prismaSchemaPath = path.join(appDir, "prisma/schema.prisma");
  const usesPrisma = await fs.pathExists(prismaSchemaPath);
  let databaseProvider: "sqlite" | "postgresql" | undefined;
  if (usesPrisma) {
    const prismaSchema = await fs.readFile(prismaSchemaPath, "utf8");
    const provider = prismaSchema.match(/provider\s*=\s*"(sqlite|postgresql)"/)?.[1];
    if (provider === "sqlite" || provider === "postgresql") databaseProvider = provider;
  }
  const envPath = path.join(rootDir, ".env");
  let env: Record<string, string | undefined> = {};
  let envParseError: string | undefined;

  if (await fs.pathExists(envPath)) {
    try {
      env = parseEnv(await fs.readFile(envPath, "utf8"));
    } catch {
      envParseError = "invalid dotenv syntax";
    }
  }

  return {
    rootDir,
    appDir,
    preset,
    packageManager: await detectPackageManager(
      rootDir,
      packageJson,
      manifest.status === "valid" ? manifest.manifest.packageManager : undefined,
    ),
    packageJson,
    appPackageJson,
    env,
    ...(envParseError ? { envParseError } : {}),
    oauthProviders: await readOAuthProviders(rootDir, preset),
    usesPrisma,
    ...(databaseProvider ? { databaseProvider } : {}),
    manifest,
  };
}
