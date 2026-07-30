import { randomBytes } from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import { parseEnv } from "node:util";
import { generateSigningJwk } from "authenik8-core";

import { supportedOAuthProviders, type OAuthProvider } from "../../lib/oauth.js";
import {
  PROJECT_MANIFEST_FILENAME,
  readProjectManifest,
} from "../../lib/projectManifest.js";
import type {
  DoctorContext,
  DoctorPackageManager,
  DoctorPreset,
  PackageJson,
} from "./types.js";

export class DoctorProjectError extends Error {}

export type CreateDoctorContextOptions = {
  offline?: boolean;
  processEnv?: NodeJS.ProcessEnv;
};

type LocatedDoctorProject = {
  rootDir: string;
  packageJson: PackageJson;
};

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

async function ephemeralSigningConfiguration(): Promise<{
  AUTHENIK8_SIGNING_JWKS: string;
  AUTHENIK8_ACTIVE_KID: string;
}> {
  const jwk = await generateSigningJwk();
  return {
    AUTHENIK8_SIGNING_JWKS: JSON.stringify([jwk]),
    AUTHENIK8_ACTIVE_KID: jwk.kid!,
  };
}

function applyExplicitPair(
  env: Record<string, string | undefined>,
  processEnv: NodeJS.ProcessEnv,
  first: string,
  second: string,
  fallback: () => readonly [string, string],
): void {
  const firstExplicit = processEnv[first] !== undefined;
  const secondExplicit = processEnv[second] !== undefined;
  if (firstExplicit || secondExplicit) {
    env[first] = firstExplicit ? processEnv[first] : "";
    env[second] = secondExplicit ? processEnv[second] : "";
    return;
  }
  const [firstValue, secondValue] = fallback();
  env[first] = firstValue;
  env[second] = secondValue;
}

function closingQuoteIndex(
  value: string,
  quote: "'" | "\"",
  start = 0,
): number {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] !== quote) continue;
    let backslashes = 0;
    for (
      let cursor = index - 1;
      cursor >= 0 && value[cursor] === "\\";
      cursor -= 1
    ) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function dotenvSyntaxError(source: string): string | undefined {
  if (source.includes("\0")) return "invalid dotenv syntax";
  const lines = source.split(/\r?\n/);
  let openQuote: "'" | "\"" | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (openQuote) {
      const closing = closingQuoteIndex(line, openQuote);
      if (closing < 0) continue;
      if (!/^\s*(?:#.*)?$/.test(line.slice(closing + 1))) {
        return `invalid dotenv syntax on line ${index + 1}`;
      }
      openQuote = undefined;
      continue;
    }

    let candidate = line.trim();
    if (!candidate || candidate.startsWith("#")) continue;
    if (candidate.startsWith("export ")) candidate = candidate.slice(7).trimStart();
    const assignment = candidate.match(
      /^([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/,
    );
    if (!assignment) return `invalid dotenv syntax on line ${index + 1}`;
    const value = assignment[2]!.trimStart();
    const quote = value[0];
    if (quote !== "'" && quote !== "\"") continue;
    const closing = closingQuoteIndex(value, quote, 1);
    if (closing < 0) {
      openQuote = quote;
    } else if (!/^\s*(?:#.*)?$/.test(value.slice(closing + 1))) {
      return `invalid dotenv syntax on line ${index + 1}`;
    }
  }

  return openQuote ? "invalid dotenv syntax: unterminated quoted value" : undefined;
}

async function readDoctorEnvironment(
  rootDir: string,
  oauthProviders: readonly OAuthProvider[],
  options: CreateDoctorContextOptions,
): Promise<{
  env: Record<string, string | undefined>;
  envSource: DoctorContext["envSource"];
  envParseError?: string;
}> {
  const offline = options.offline ?? false;
  const sourceName = offline ? ".env.example" : ".env";
  const sourcePath = path.join(rootDir, sourceName);
  let env: Record<string, string | undefined> = {};

  if (await fs.pathExists(sourcePath)) {
    try {
      const source = await fs.readFile(sourcePath, "utf8");
      const syntaxError = dotenvSyntaxError(source);
      if (syntaxError) {
        return {
          env,
          envSource: sourceName,
          envParseError: syntaxError,
        };
      }
      env = parseEnv(source);
    } catch {
      return {
        env,
        envSource: sourceName,
        envParseError: "invalid dotenv syntax",
      };
    }
  } else if (!offline) {
    return { env, envSource: "none" };
  }

  if (!offline) return { env, envSource: sourceName };

  const processEnv = options.processEnv ?? process.env;
  const signingKeys = ["AUTHENIK8_SIGNING_JWKS", "AUTHENIK8_ACTIVE_KID"] as const;
  const signingExplicit = signingKeys.some((key) => processEnv[key] !== undefined);
  if (signingExplicit) {
    for (const key of signingKeys) {
      env[key] = processEnv[key] ?? "";
    }
  } else {
    Object.assign(env, await ephemeralSigningConfiguration());
  }

  env.REFRESH_SECRET = processEnv.REFRESH_SECRET
    ?? randomBytes(48).toString("base64url");
  env.AUTHENIK8_AGENTS = processEnv.AUTHENIK8_AGENTS ?? env.AUTHENIK8_AGENTS ?? "{}";

  for (const provider of oauthProviders) {
    const prefix = provider.toUpperCase();
    applyExplicitPair(
      env,
      processEnv,
      `${prefix}_CLIENT_ID`,
      `${prefix}_CLIENT_SECRET`,
      () => [
        `doctor-${provider}-client`,
        randomBytes(32).toString("base64url"),
      ],
    );
    const redirectKey = `${prefix}_REDIRECT_URI`;
    if (processEnv[redirectKey] !== undefined) env[redirectKey] = processEnv[redirectKey];
  }

  for (const key of [
    "AUTHENIK8_ISSUER",
    "AUTHENIK8_AUDIENCE",
    "DATABASE_URL",
    "REDIS_URL",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "WEB_ORIGIN",
    "PORT",
    "COOKIE_SECURE",
    "AUTHENIK8_LOCAL_DATABASE",
    "NODE_ENV",
  ]) {
    if (processEnv[key] !== undefined) env[key] = processEnv[key];
  }

  return { env, envSource: sourceName };
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

async function locateDoctorProject(directory: string): Promise<LocatedDoctorProject> {
  let current = path.resolve(directory);
  try {
    if ((await fs.stat(current)).isFile()) current = path.dirname(current);
  } catch {}

  while (true) {
    const [hasManifest, hasExpressServer, hasFullstackServer] = await Promise.all([
      fs.pathExists(path.join(current, PROJECT_MANIFEST_FILENAME)),
      fs.pathExists(path.join(current, "src/server.ts")),
      fs.pathExists(path.join(current, "apps/api/src/server.ts")),
    ]);
    let projectRoot = current;
    let hasProjectSignal = hasManifest || hasFullstackServer;

    if (!hasProjectSignal && hasExpressServer) {
      const workspaceRoot = path.dirname(path.dirname(current));
      const isFullstackApiWorkspace = path.basename(current) === "api"
        && path.basename(path.dirname(current)) === "apps"
        && await fs.pathExists(
          path.join(workspaceRoot, "apps/api/src/server.ts"),
        );
      if (isFullstackApiWorkspace) {
        projectRoot = workspaceRoot;
      }
      hasProjectSignal = true;
    }

    if (hasProjectSignal) {
      const projectPackagePath = path.join(projectRoot, "package.json");
      if (!(await fs.pathExists(projectPackagePath))) {
        throw new DoctorProjectError(
          `Authenik8 project files were found in ${projectRoot}, but package.json is missing.`,
        );
      }
      return {
        rootDir: projectRoot,
        packageJson: await readPackageJson(projectPackagePath),
      };
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new DoctorProjectError(
    `No Authenik8 project was found at or above ${path.resolve(directory)}.`,
  );
}

export async function createDoctorContext(
  directory: string,
  options: CreateDoctorContextOptions = {},
): Promise<DoctorContext> {
  const { rootDir, packageJson } = await locateDoctorProject(directory);
  const manifest = await readProjectManifest(rootDir);
  const { preset, appDir, appPackageJson } = await detectPreset(rootDir, packageJson);
  const oauthProviders = await readOAuthProviders(rootDir, preset);
  const prismaSchemaPath = path.join(appDir, "prisma/schema.prisma");
  const usesPrisma = await fs.pathExists(prismaSchemaPath);
  let databaseProvider: "sqlite" | "postgresql" | undefined;
  if (usesPrisma) {
    const prismaSchema = await fs.readFile(prismaSchemaPath, "utf8");
    const provider = prismaSchema.match(/provider\s*=\s*"(sqlite|postgresql)"/)?.[1];
    if (provider === "sqlite" || provider === "postgresql") databaseProvider = provider;
  }
  const environment = await readDoctorEnvironment(rootDir, oauthProviders, options);

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
    env: environment.env,
    envSource: environment.envSource,
    ...(environment.envParseError ? { envParseError: environment.envParseError } : {}),
    oauthProviders,
    usesPrisma,
    ...(databaseProvider ? { databaseProvider } : {}),
    manifest,
  };
}
