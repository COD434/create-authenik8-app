import { spawnSync } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import { parseEnv } from "node:util";

import { supportsFullstackPreset } from "../../lib/preflight.js";
import { PROJECT_MANIFEST_FILENAME } from "../../lib/projectManifest.js";
import { exerciseEngineSigningKeyRing } from "../../lib/engineSigning.js";
import { loadProjectEngine } from "../../lib/projectEngine.js";
import { inspectSigningKeyRing } from "../../lib/signingKeyRing.js";
import { stableDiagnosticId } from "./catalog.js";
import { redisEndpointFromEnv } from "./services.js";
import type {
  DoctorCheck,
  DoctorContext,
  PackageJson,
} from "./types.js";

const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AGENT_SCOPE = /^[a-z][a-z0-9._/-]*(?::[a-z][a-z0-9._/-]*)+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function check(
  id: string,
  label: string,
  status: DoctorCheck["status"],
  message: string,
  fix?: string,
): DoctorCheck {
  return {
    id: stableDiagnosticId(id),
    label,
    status,
    message,
    ...(fix ? { fix } : {}),
  };
}

function validHttpUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validAgentRegistry(source: string | undefined): boolean {
  if (!source?.trim()) return true;
  try {
    const registry = JSON.parse(source) as unknown;
    return isRecord(registry) && Object.entries(registry).every(([agentId, scopes]) =>
      AGENT_ID.test(agentId) && Array.isArray(scopes) && scopes.length > 0 && scopes.length <= 64 &&
      scopes.every((scope) => typeof scope === "string" && scope.length <= 128 && AGENT_SCOPE.test(scope))
    );
  } catch {
    return false;
  }
}

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  return /^(?:change-me|your-|replace-|example|todo)|(?:client-id|client-secret)/i.test(value.trim());
}

async function requiredFilesCheck(context: DoctorContext): Promise<DoctorCheck> {
  const files = [
    ".env.example",
    ".gitignore",
    "README.md",
    "THREAT_MODEL.md",
    "AGENT_IDENTITY.md",
    context.preset === "fullstack" ? "apps/api/src/server.ts" : "src/server.ts",
  ];
  if (context.envSource !== ".env.example") files.unshift(".env");
  if (context.preset === "fullstack") {
    files.push("scripts/run-local.mjs");
  } else {
    files.push("docker-compose.yml");
  }
  if (context.usesPrisma) {
    files.push(path.relative(context.rootDir, path.join(context.appDir, "prisma/schema.prisma")));
    files.push(path.relative(context.rootDir, path.join(context.appDir, "prisma.config.ts")));
    if (context.preset === "fullstack") {
      files.push(path.relative(
        context.rootDir,
        path.join(context.appDir, "prisma/migrations/migration_lock.toml"),
      ));
    }
  }
  const missing = (await Promise.all(files.map(async (file) =>
    await fs.pathExists(path.join(context.rootDir, file)) ? undefined : file
  ))).filter((file): file is string => Boolean(file));

  return missing.length === 0
    ? check("project.files", "Project structure", "pass", "Required Authenik8 project files are present")
    : check(
      "project.files",
      "Project structure",
      "fail",
      `Missing required files: ${missing.join(", ")}`,
      "Restore the files from source control or regenerate the project before changing auth code.",
    );
}

async function environmentPermissionsCheck(
  context: DoctorContext,
): Promise<DoctorCheck> {
  if (process.platform === "win32" || context.envSource !== ".env") {
    return check(
      "security.env.permissions",
      "Environment permissions",
      "skip",
      context.envSource === ".env.example"
        ? "Offline diagnostics keep synthetic secrets in memory"
        : "POSIX environment permissions do not apply on this platform",
    );
  }

  const envPath = path.join(context.rootDir, ".env");
  if (!(await fs.pathExists(envPath))) {
    return check(
      "security.env.permissions",
      "Environment permissions",
      "fail",
      ".env is missing",
      "Restore the generated private environment file and restrict it to mode 0600.",
    );
  }
  const mode = (await fs.stat(envPath)).mode & 0o777;
  return (mode & 0o077) === 0
    ? check(
      "security.env.permissions",
      "Environment permissions",
      "pass",
      `.env permissions are restricted (${mode.toString(8).padStart(3, "0")})`,
    )
    : check(
      "security.env.permissions",
      "Environment permissions",
      "fail",
      `.env permissions are too broad (${mode.toString(8).padStart(3, "0")})`,
      "Restrict .env to the owning user with mode 0600.",
    );
}

function scriptsCheck(context: DoctorContext): DoctorCheck {
  const required = ["dev", "build"];
  if (context.preset === "fullstack") {
    required.push("setup", "db:seed");
  }
  const scripts = context.packageJson.scripts ?? {};
  const missing = required.filter((name) => !scripts[name]);
  if (context.usesPrisma) {
    const hasMigrationScript = context.preset === "fullstack"
      ? Boolean(scripts["db:migrate"])
      : Boolean(scripts["db:migrate"] || scripts["prisma:migrate"]);
    if (!hasMigrationScript) missing.push("db:migrate");
  }
  return missing.length === 0
    ? check(
      "project.scripts",
      "Project scripts",
      "pass",
      "Development, build, and migration scripts are wired",
    )
    : check(
      "project.scripts",
      "Project scripts",
      "fail",
      `Missing package scripts: ${missing.join(", ")}`,
      "Restore the generated package.json scripts before running the application.",
    );
}

function declaredCoreVersion(packageJson: PackageJson): string | undefined {
  return packageJson.dependencies?.["authenik8-core"] ?? packageJson.devDependencies?.["authenik8-core"];
}

async function coreDependencyCheck(
  context: DoctorContext,
  allowMissingCore = false,
): Promise<DoctorCheck> {
  const declared = declaredCoreVersion(context.appPackageJson);
  if (!declared) {
    return check("dependency.core", "Identity engine", "fail", "authenik8-core is not declared", `${context.packageManager} install`);
  }

  const candidates = [
    path.join(context.appDir, "node_modules/authenik8-core/package.json"),
    path.join(context.rootDir, "node_modules/authenik8-core/package.json"),
  ];
  const installedPath = (await Promise.all(candidates.map(async (candidate) =>
    await fs.pathExists(candidate) ? candidate : undefined
  ))).find(Boolean);
  if (!installedPath) {
    return check(
      "dependency.core",
      "Identity engine",
      allowMissingCore ? "warn" : "fail",
      `authenik8-core ${declared} is declared but not installed`,
      `${context.packageManager} install`,
    );
  }

  let installed: PackageJson;
  try {
    installed = await fs.readJson(installedPath) as PackageJson;
  } catch {
    return check("dependency.core", "Identity engine", "fail", "The installed authenik8-core package metadata is unreadable", `${context.packageManager} install`);
  }
  if (!installed.version) {
    return check("dependency.core", "Identity engine", "fail", "The installed authenik8-core version is missing", `${context.packageManager} install`);
  }
  if (/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(declared) && declared !== installed.version) {
    return check(
      "dependency.core",
      "Identity engine",
      "fail",
      `Declared authenik8-core ${declared}, but installed ${installed.version}`,
      `${context.packageManager} install`,
    );
  }
  return check("dependency.core", "Identity engine", "pass", `authenik8-core ${installed.version} is installed`);
}

async function projectManifestCheck(context: DoctorContext): Promise<DoctorCheck> {
  if (context.manifest.status === "missing") {
    return check(
      "project.manifest",
      "Project manifest",
      "warn",
      `${PROJECT_MANIFEST_FILENAME} is missing; structural compatibility mode is active`,
      "Regenerate with a current create-authenik8-app release before using future upgrade automation.",
    );
  }
  if (context.manifest.status === "invalid") {
    return check(
      "project.manifest",
      "Project manifest",
      "fail",
      context.manifest.message,
      `Restore ${PROJECT_MANIFEST_FILENAME} from source control; never add secrets to it.`,
    );
  }

  const manifest = context.manifest.manifest;
  const differences: string[] = [];
  const declaredCore = declaredCoreVersion(context.appPackageJson);
  const actualOAuth = [...context.oauthProviders].sort().join(",");
  const manifestOAuth = [...manifest.features.oauthProviders].sort().join(",");
  const hasPm2 = Boolean(context.packageJson.scripts?.["pm2:start"]);

  if (manifest.projectName !== context.packageJson.name) differences.push("project name");
  if (manifest.preset !== context.preset) differences.push("preset");
  if (manifest.packageManager !== context.packageManager) differences.push("package manager");
  if (manifest.engine.version !== declaredCore) differences.push("authenik8-core version");
  if (manifest.features.prisma !== context.usesPrisma) differences.push("Prisma feature");
  if (manifest.database !== (context.databaseProvider ?? null)) differences.push("database provider");
  if (manifestOAuth !== actualOAuth) differences.push("OAuth providers");
  if (manifest.features.pm2 !== hasPm2) differences.push("PM2 feature");

  if (manifest.features.pm2) {
    const pm2Path = path.join(context.rootDir, "ecosystem.config.js");
    if (await fs.pathExists(pm2Path)) {
      const pm2Source = await fs.readFile(pm2Path, "utf8");
      const runtime = /interpreter:\s*["']bun["']/.test(pm2Source) ? "bun" : "node";
      if (manifest.runtime !== runtime) differences.push("production runtime");
    } else {
      differences.push("PM2 configuration");
    }
  }

  return differences.length === 0
    ? check(
      "project.manifest",
      "Project manifest",
      "pass",
      `Schema v${manifest.schemaVersion} matches the generated project and authenik8-core declaration`,
    )
    : check(
      "project.manifest",
      "Project manifest",
      "fail",
      `Manifest drift detected: ${differences.join(", ")}`,
      "Review intentional architecture changes, then update the manifest as one audited change.",
    );
}

async function environmentSafetyCheck(context: DoctorContext): Promise<DoctorCheck> {
  const ignorePath = path.join(context.rootDir, ".gitignore");
  if (!(await fs.pathExists(ignorePath))) {
    return check("security.env", "Secret-file safety", "fail", ".gitignore is missing", "Add .env to .gitignore immediately.");
  }
  const ignored = (await fs.readFile(ignorePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === ".env" || line === ".env*" || line === ".env.*");
  if (!ignored) {
    return check("security.env", "Secret-file safety", "fail", ".env is not ignored by Git", "Add .env to .gitignore immediately.");
  }

  const insideGit = spawnSync("git", ["-C", context.rootDir, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (insideGit.status === 0) {
    const tracked = spawnSync("git", ["-C", context.rootDir, "ls-files", "--error-unmatch", ".env"], {
      stdio: "ignore",
    });
    if (tracked.status === 0) {
      return check(
        "security.env",
        "Secret-file safety",
        "fail",
        ".env is tracked by Git and may expose signing or refresh secrets",
        "Remove .env from Git history and rotate every exposed signing key and refresh secret.",
      );
    }
  }

  const examplePath = path.join(context.rootDir, ".env.example");
  if (await fs.pathExists(examplePath)) {
    const source = await fs.readFile(examplePath, "utf8");
    let example: Record<string, string | undefined> = {};
    try {
      example = parseEnv(source);
    } catch {
      return check("security.env", "Secret-file safety", "warn", ".env.example could not be parsed", "Keep the example file valid and free of real secrets.");
    }
    if (/\"d\"\s*:/.test(example.AUTHENIK8_SIGNING_JWKS ?? "")) {
      return check("security.env", "Secret-file safety", "fail", ".env.example contains a private signing JWK", "Remove the private key and rotate it if the file was committed.");
    }
    const exampleSecret = example.REFRESH_SECRET?.trim();
    if (exampleSecret && exampleSecret.length >= 32 && !/(?:replace|change|example|generated|random)/i.test(exampleSecret)) {
      return check("security.env", "Secret-file safety", "fail", ".env.example appears to contain a real refresh secret", "Replace it with an obvious placeholder and rotate the secret.");
    }
  }
  return check("security.env", "Secret-file safety", "pass", ".env is ignored, untracked, and examples contain no private signing material");
}

async function databaseCheck(context: DoctorContext): Promise<DoctorCheck> {
  const value = context.env.DATABASE_URL?.trim();
  const provider = context.databaseProvider;
  const valid = provider === "sqlite"
    ? value?.startsWith("file:")
    : provider === "postgresql"
      ? /^(?:postgresql|postgres):\/\//.test(value ?? "")
      : false;
  return valid
    ? check("environment.database", "Database configuration", "pass", `${provider} DATABASE_URL matches the Prisma provider`)
    : check(
      "environment.database",
      "Database configuration",
      "fail",
      `DATABASE_URL does not match the ${provider ?? "unknown"} Prisma provider`,
      provider === "sqlite" ? "Use a file: URL." : "Use a postgresql:// URL.",
    );
}

function oauthChecks(context: DoctorContext): DoctorCheck[] {
  return context.oauthProviders.map((provider) => {
    const prefix = provider.toUpperCase();
    const clientId = context.env[`${prefix}_CLIENT_ID`];
    const clientSecret = context.env[`${prefix}_CLIENT_SECRET`];
    const redirect = context.env[`${prefix}_REDIRECT_URI`];
    const expectedPath = context.preset === "fullstack"
      ? `/api/auth/oauth/${provider}/callback`
      : `/auth/${provider}/callback`;
    let validRedirect = false;
    try {
      validRedirect = validHttpUrl(redirect) && new URL(redirect as string).pathname === expectedPath;
    } catch {}

    if (looksLikePlaceholder(clientId) || looksLikePlaceholder(clientSecret)) {
      return check(
        `oauth.${provider}`,
        `${provider} OAuth`,
        "warn",
        `${provider} is enabled, but its client credentials are not configured`,
        `Set ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET before testing ${provider} sign-in.`,
      );
    }
    if (!validRedirect) {
      return check(
        `oauth.${provider}`,
        `${provider} OAuth`,
        "fail",
        `${prefix}_REDIRECT_URI must be an HTTP(S) URL ending in ${expectedPath}`,
        `Use the exact same callback URL in .env and the ${provider} provider console.`,
      );
    }
    return check(`oauth.${provider}`, `${provider} OAuth`, "pass", `${provider} credentials and callback shape are configured`);
  });
}

function oauthRoutesCheck(context: DoctorContext): DoctorCheck | undefined {
  if (context.oauthProviders.length > 0) {
    return check(
      "oauth.routes",
      "OAuth routes",
      "pass",
      `Recognized provider routes are present: ${context.oauthProviders.join(", ")}`,
    );
  }
  if (context.preset !== "auth-oauth") return undefined;
  return check(
    "oauth.routes",
    "OAuth routes",
    "fail",
    "The OAuth preset has no recognized provider routes",
    "Restore at least one generated Google or GitHub route and its matching configuration.",
  );
}

function skippedEnvironmentChecks(context: DoctorContext): DoctorCheck[] {
  const skipped = (
    id: string,
    label: string,
  ): DoctorCheck => check(
    id,
    label,
    "skip",
    "Skipped because the environment source did not pass A8-ENV-002",
  );
  const checks = [
    skipped("auth.signing", "Signing key ring"),
    skipped("auth.claims", "Token claims"),
    skipped("auth.refresh", "Refresh-token secret"),
    skipped("auth.agents", "Agent identity"),
    skipped("environment.port", "Application port"),
    skipped("environment.redis", "Redis configuration"),
  ];
  if (context.preset === "fullstack") {
    checks.push(skipped("environment.origin", "Web origin"));
  }
  if (context.usesPrisma) {
    checks.push(skipped("environment.database", "Database configuration"));
  }
  for (const provider of context.oauthProviders) {
    checks.push(skipped(`oauth.${provider}`, `${provider} OAuth`));
  }
  return checks;
}

function runtimeEnvironmentChecks(context: DoctorContext): DoctorCheck[] {
  const portSource = context.env.PORT?.trim() || "3000";
  const port = Number(portSource);
  const portValid = Number.isInteger(port) && port >= 1 && port <= 65_535;
  const checks = [portValid
    ? check("environment.port", "Application port", "pass", `PORT ${port} is valid`)
    : check("environment.port", "Application port", "fail", "PORT must be an integer from 1 to 65535", "Set a valid, available application port.")];

  if (context.preset === "fullstack") {
    checks.push(validHttpUrl(context.env.WEB_ORIGIN)
      ? check("environment.origin", "Web origin", "pass", "WEB_ORIGIN is a valid HTTP(S) URL")
      : check("environment.origin", "Web origin", "fail", "WEB_ORIGIN must be a valid HTTP(S) URL", "Set it to the exact browser origin allowed to call the API."));
  }

  const redisUrl = context.env.REDIS_URL?.trim();
  const usesMemoryRedis = redisUrl === "memory://";
  if (usesMemoryRedis) {
    checks.push(context.env.NODE_ENV === "production"
      ? check(
        "environment.redis",
        "Redis configuration",
        "fail",
        "The in-process Redis store is for local development only",
        "Set REDIS_URL to a redis:// or rediss:// endpoint in production.",
      )
      : check(
        "environment.redis",
        "Redis configuration",
        "pass",
        "The in-process Redis-compatible store is configured for local development",
      ));
    return checks;
  }

  const usesRedisUrl = context.preset === "fullstack" || Boolean(redisUrl);
  try {
    const endpoint = redisEndpointFromEnv(context.env, usesRedisUrl);
    if (
      !endpoint.host
      || !Number.isInteger(endpoint.port)
      || endpoint.port < 1
      || endpoint.port > 65_535
    ) {
      throw new Error("invalid Redis endpoint");
    }
    checks.push(check(
      "environment.redis",
      "Redis configuration",
      "pass",
      "Redis host and port are structurally valid",
    ));
  } catch {
    checks.push(check(
      "environment.redis",
      "Redis configuration",
      "fail",
      usesRedisUrl ? "REDIS_URL is invalid" : "REDIS_HOST or REDIS_PORT is invalid",
      usesRedisUrl ? "Use a redis:// or rediss:// URL." : "Set a host and a port from 1 to 65535.",
    ));
  }
  return checks;
}

export async function runStaticChecks(
  context: DoctorContext,
  nodeVersion = process.versions.node,
  allowMissingCore = false,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push(supportsFullstackPreset(nodeVersion)
    ? check("runtime.node", "Node.js runtime", "pass", `Node.js ${nodeVersion} is supported`)
    : check("runtime.node", "Node.js runtime", "fail", `Node.js ${nodeVersion} is unsupported`, "Use Node.js 20.19+, 22.12+, or 24+."));
  checks.push(await requiredFilesCheck(context));
  checks.push(await projectManifestCheck(context));
  checks.push(scriptsCheck(context));
  const coreDependency = await coreDependencyCheck(context, allowMissingCore);
  checks.push(coreDependency);
  checks.push(await environmentSafetyCheck(context));
  checks.push(await environmentPermissionsCheck(context));
  const oauthRoutes = oauthRoutesCheck(context);
  if (oauthRoutes) checks.push(oauthRoutes);

  if (context.envSource === "none") {
    checks.push(check(
      "environment.syntax",
      "Environment file",
      "fail",
      ".env is missing",
      "Restore the generated .env file, or use --offline in a clean checkout.",
    ));
    checks.push(...skippedEnvironmentChecks(context));
    return checks;
  }
  if (context.envParseError) {
    checks.push(check(
      "environment.syntax",
      "Environment file",
      "fail",
      `${context.envSource} is invalid: ${context.envParseError}`,
      `Fix ${context.envSource} syntax without printing or committing its values.`,
    ));
    checks.push(...skippedEnvironmentChecks(context));
    return checks;
  }
  checks.push(check(
    "environment.syntax",
    "Environment file",
    "pass",
    `${context.envSource} parsed successfully`,
  ));

  const signingInspection = inspectSigningKeyRing(
    context.env.AUTHENIK8_SIGNING_JWKS,
    context.env.AUTHENIK8_ACTIVE_KID,
  );
  let signingError = signingInspection.valid
    ? undefined
    : signingInspection.error;
  if (signingInspection.valid && coreDependency.status === "pass") {
    try {
      await exerciseEngineSigningKeyRing(
        loadProjectEngine(
          context.appDir,
          ["createAuthenik8", "verifyAccessTokenWithJwks"],
        ),
        signingInspection.keys,
        signingInspection.active.kid,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      signingError =
        `Installed authenik8-core rejected the signing key ring: ${detail.slice(0, 400)}`;
    }
  }
  checks.push(signingError
    ? check("auth.signing", "Signing key ring", "fail", signingError, "Restore the generated private ES256 key ring or rotate it deliberately.")
    : check("auth.signing", "Signing key ring", "pass", "The installed engine can sign and verify with the active ES256 P-256 key"));

  const issuerValid = validHttpUrl(context.env.AUTHENIK8_ISSUER);
  const audienceValid = Boolean(context.env.AUTHENIK8_AUDIENCE?.trim());
  checks.push(issuerValid && audienceValid
    ? check("auth.claims", "Token claims", "pass", "Issuer and audience are configured")
    : check("auth.claims", "Token claims", "fail", "AUTHENIK8_ISSUER must be an HTTP(S) URL and AUTHENIK8_AUDIENCE must be non-empty", "Set stable issuer and audience values before issuing tokens."));

  checks.push((context.env.REFRESH_SECRET?.length ?? 0) >= 32
    ? check("auth.refresh", "Refresh-token secret", "pass", "REFRESH_SECRET meets the minimum length")
    : check("auth.refresh", "Refresh-token secret", "fail", "REFRESH_SECRET must contain at least 32 characters", "Generate a high-entropy secret and store it outside source control."));

  checks.push(validAgentRegistry(context.env.AUTHENIK8_AGENTS)
    ? check("auth.agents", "Agent identity", "pass", "Agent scopes are structurally valid (an empty registry disables agent identity)")
    : check("auth.agents", "Agent identity", "fail", "AUTHENIK8_AGENTS must map valid agent IDs to 1-64 exact resource:action scopes", "Use {} to disable agent identity or grant only explicit, least-privilege scopes."));

  checks.push(...runtimeEnvironmentChecks(context));
  if (context.usesPrisma) checks.push(await databaseCheck(context));
  checks.push(...oauthChecks(context));
  return checks;
}

function localHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "0.0.0.0";
}

function productionUrl(
  value: string | undefined,
  options: { allowRedis?: boolean } = {},
): boolean {
  if (!value?.trim() || value.includes("*")) return false;
  try {
    const url = new URL(value);
    const allowedProtocol = options.allowRedis
      ? url.protocol === "redis:" || url.protocol === "rediss:"
      : url.protocol === "https:";
    return allowedProtocol && !localHostname(url.hostname);
  } catch {
    return false;
  }
}

export function runProductionChecks(context: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  checks.push(context.env.NODE_ENV === "production"
    ? check(
      "production.runtime",
      "Production runtime",
      "pass",
      "NODE_ENV is production",
    )
    : check(
      "production.runtime",
      "Production runtime",
      "fail",
      "NODE_ENV must be production for a production diagnostic",
      "Set NODE_ENV=production in the deployment environment.",
    ));

  const redisUrl = context.env.REDIS_URL?.trim();
  const redisProductionReady = redisUrl
    ? productionUrl(redisUrl, { allowRedis: true })
    : context.preset !== "fullstack"
      && Boolean(context.env.REDIS_HOST?.trim())
      && !localHostname(context.env.REDIS_HOST!.trim());
  checks.push(redisProductionReady
    ? check(
      "production.redis",
      "Production Redis",
      "pass",
      "An external non-loopback Redis endpoint is configured",
    )
    : check(
      "production.redis",
      "Production Redis",
      "fail",
      "Production requires an external non-loopback Redis endpoint",
      "Replace memory:// or loopback Redis with a private redis:// or rediss:// service.",
    ));

  const deploymentUrls = [
    context.env.AUTHENIK8_ISSUER,
    ...(context.preset === "fullstack" ? [context.env.WEB_ORIGIN] : []),
    ...context.oauthProviders.map(
      (provider) => context.env[`${provider.toUpperCase()}_REDIRECT_URI`],
    ),
  ];
  checks.push(deploymentUrls.every((value) => productionUrl(value))
    ? check(
      "production.http",
      "Production origins",
      "pass",
      "Issuer, browser origin, and enabled OAuth callbacks use exact non-local HTTPS URLs",
    )
    : check(
      "production.http",
      "Production origins",
      "fail",
      "Production issuer, browser origin, and OAuth callbacks must be exact non-local HTTPS URLs",
      "Replace HTTP, wildcard, and local URLs with the exact deployed HTTPS origins.",
    ));

  if (context.preset === "fullstack") {
    checks.push(context.env.COOKIE_SECURE === "true"
      ? check(
        "production.cookies",
        "Production cookies",
        "pass",
        "Refresh cookies require secure transport",
      )
      : check(
        "production.cookies",
        "Production cookies",
        "fail",
        "COOKIE_SECURE must be true in production",
        "Set COOKIE_SECURE=true behind the trusted HTTPS boundary.",
      ));

    let externalDatabase = false;
    try {
      const databaseUrl = new URL(context.env.DATABASE_URL ?? "");
      externalDatabase = (
        databaseUrl.protocol === "postgresql:"
        || databaseUrl.protocol === "postgres:"
      ) && !localHostname(databaseUrl.hostname)
        && context.env.AUTHENIK8_LOCAL_DATABASE === "external";
    } catch {}
    checks.push(externalDatabase
      ? check(
        "production.database",
        "Production database",
        "pass",
        "An external non-loopback PostgreSQL database is configured",
      )
      : check(
        "production.database",
        "Production database",
        "fail",
        "Fullstack production requires external non-loopback PostgreSQL",
        "Set AUTHENIK8_LOCAL_DATABASE=external and use a managed postgresql:// endpoint.",
      ));
  }

  return checks;
}
