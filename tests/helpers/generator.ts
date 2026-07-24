import { spawn } from "child_process";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs-extra";
import { vi } from "vitest";

import type { CliState } from "../../src/lib/types.js";
import { writeProjectManifest } from "../../src/lib/projectManifest.js";
import {
  createProject,
  configurePackageJson,
  resolveTemplateName,
} from "../../src/steps/createProject.js";
import { configurePrisma } from "../../src/steps/configurePrisma.js";
import { configureGeneratedReadme } from "../../src/steps/configureReadme.js";
import { installAuth } from "../../src/steps/installAuth.js";
import { configureProduction } from "../../src/steps/finalSetup.js";
import * as hashUtils from "../../src/utils/hash.js";

type TemplateKind = "base" | "auth" | "auth-oauth" | "fullstack";

export type GeneratedProject = {
  rootDir: string;
  targetDir: string;
  state: CliState;
  cleanup: () => Promise<void>;
  hashLib?: string;
};

export type GenerateProjectOptions = {
  template: TemplateKind;
  database?: "sqlite" | "postgresql";
  usePrisma?: boolean;
  productionRuntime?: "node" | "bun";
  hashLib?: "bcryptjs";
  oauthProviders?: string[];
  packageManager?: "npm" | "pnpm" | "bun";
  templateLineEndings?: "lf" | "crlf";
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../");
const templateRoot = path.join(repoRoot, "templates");
const generatorVersion = (fs.readJsonSync(path.join(repoRoot, "package.json")) as { version: string }).version;
const tsxLoaderPath = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const tsxLoaderUrl = pathToFileURL(tsxLoaderPath).href;

const templateToAuthMode: Record<TemplateKind, CliState["authMode"]> = {
  base: "base",
  auth: "auth",
  "auth-oauth": "auth-oauth",
  fullstack: "fullstack",
};

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

async function writePackageStub(targetDir: string, name: string, source: string) {
  const moduleDir = path.join(targetDir, "node_modules", name);
  await fs.ensureDir(moduleDir);
  await fs.writeJson(
    path.join(moduleDir, "package.json"),
    {
      name,
      type: "module",
      main: "./index.js",
      exports: "./index.js",
    },
    { spaces: 2 },
  );
  await fs.writeFile(path.join(moduleDir, "index.js"), source);
}

export async function generateProjectFixture(
  options: GenerateProjectOptions,
): Promise<GeneratedProject> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "authenik8-vitest-"));
  const targetDir = path.join(rootDir, "generated-app");
  const state: CliState = {
    step: "prompts",
    projectName: "generated-app",
    framework: "Express",
    authMode: templateToAuthMode[options.template],
    usePrisma: options.usePrisma ?? true,
    database: options.database ?? "sqlite",
    useGit: false,
    runtime: options.productionRuntime,
    oauthProviders: options.oauthProviders,
  };

  let fixtureTemplateRoot = templateRoot;
  if (options.templateLineEndings === "crlf") {
    fixtureTemplateRoot = path.join(rootDir, "templates");
    const templateName = resolveTemplateName(state.authMode ?? "base");
    const fixtureTemplatePath = path.join(fixtureTemplateRoot, templateName);

    await fs.copy(path.join(templateRoot, templateName), fixtureTemplatePath);
    await fs.copy(path.join(templateRoot, "prisma"), path.join(fixtureTemplateRoot, "prisma"));
    await fs.copy(
      path.join(templateRoot, "THREAT_MODEL.md"),
      path.join(fixtureTemplateRoot, "THREAT_MODEL.md"),
    );
    await fs.copy(
      path.join(templateRoot, "AGENT_IDENTITY.md"),
      path.join(fixtureTemplateRoot, "AGENT_IDENTITY.md"),
    );

    const readmePath = path.join(fixtureTemplatePath, "README.md");
    if (await fs.pathExists(readmePath)) {
      const readme = await fs.readFile(readmePath, "utf8");
      await fs.writeFile(readmePath, readme.replace(/\r?\n/g, "\r\n"));
    }
  }

  await createProject(state, targetDir, fixtureTemplateRoot);

  let hashLib: string | undefined;

  if (state.authMode !== "base" && state.authMode !== "fullstack") {
    const hashSpy = vi
      .spyOn(hashUtils, "getBestHashLib")
      .mockReturnValue(options.hashLib ?? "bcryptjs");

    try {
      hashLib = await installAuth(targetDir, "npm");
    } finally {
      hashSpy.mockRestore();
    }
  }

  await configurePrisma(state, targetDir, fixtureTemplateRoot);
  const packageManager = state.authMode === "fullstack"
    ? "npm"
    : options.packageManager ?? "npm";
  configurePackageJson(targetDir, state.usePrisma ?? false, packageManager);

  if (options.productionRuntime) {
    await configureProduction(
      targetDir,
      state.projectName,
      options.productionRuntime,
      packageManager,
    );
  }
  await configureGeneratedReadme(targetDir, packageManager);

  const manifestProviders = state.authMode === "auth-oauth" || state.authMode === "fullstack"
    ? options.oauthProviders ?? ["google", "github"]
    : [];
  await writeProjectManifest(targetDir, {
    projectName: state.projectName,
    generatorVersion,
    preset: state.authMode ?? "base",
    packageManager,
    runtime: state.authMode === "fullstack" ? "node" : options.productionRuntime ?? "node",
    ...(state.authMode === "fullstack"
      ? { database: "postgresql" as const }
      : state.usePrisma && state.database
        ? { database: state.database }
        : {}),
    usePrisma: state.authMode === "fullstack" || Boolean(state.usePrisma),
    oauthProviders: manifestProviders,
    productionReady: Boolean(options.productionRuntime) && state.authMode !== "fullstack",
  });

  return {
    rootDir,
    targetDir,
    state,
    hashLib,
    cleanup: async () => {
      await fs.remove(rootDir);
    },
  };
}

export async function collectProjectTree(rootDir: string): Promise<string[]> {
  const entries: string[] = [];
  const ignored = new Set(["node_modules", ".git", ".authenik8"]);

  async function walk(currentDir: string, relativeDir = ""): Promise<void> {
    const names = (await fs.readdir(currentDir)).sort();

    for (const name of names) {
      if (ignored.has(name)) {
        continue;
      }

      const absolutePath = path.join(currentDir, name);
      const relativePath = relativeDir ? path.join(relativeDir, name) : name;
      const stats = await fs.stat(absolutePath);

      if (stats.isDirectory()) {
        entries.push(`${toPosixPath(relativePath)}/`);
        await walk(absolutePath, relativePath);
        continue;
      }

      if (toPosixPath(relativePath) === "src/package-lock.json") {
        continue;
      }

      entries.push(toPosixPath(relativePath));
    }
  }

  await walk(rootDir);
  return entries;
}

export async function readProjectFiles(rootDir: string, relativePaths: string[]) {
  const result: Record<string, string> = {};

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDir, relativePath);
    result[toPosixPath(relativePath)] = normalizeText(await fs.readFile(absolutePath, "utf8"));
  }

  return result;
}

export async function installGeneratedAppStubs(
  targetDir: string,
  options: { realAuthCore?: boolean; realExpress?: boolean; authCorePath?: string } = {},
): Promise<void> {
  await fs.copy(
    path.join(repoRoot, "node_modules", "zod"),
    path.join(targetDir, "node_modules", "zod"),
  );

  if (options.realAuthCore) {
    const siblingCore = path.resolve(repoRoot, "../authenik8-core");
    const authCorePath = options.authCorePath
      ?? process.env.AUTHENIK8_CORE_TEST_PATH
      ?? (await fs.pathExists(path.join(siblingCore, "dist/index.js")) ? siblingCore : undefined)
      ?? path.join(repoRoot, "node_modules", "authenik8-core");
    await fs.ensureSymlink(
      path.resolve(authCorePath),
      path.join(targetDir, "node_modules", "authenik8-core"),
      "junction",
    );
  } else {
    await writePackageStub(
      targetDir,
      "authenik8-core",
      `export async function createAuthenik8(config) {
  if (!config?.redis) {
    throw new Error("Generated servers must inject a Redis-compatible client");
  }
  globalThis.__authenik8MockConfig = config;
  return {
    helmet(req, res, next) {
      if (typeof next === "function") next();
    },
    rateLimit(req, res, next) {
      if (typeof next === "function") next();
    },
    requireAdmin(req, res, next) {
      if (typeof next === "function") next();
    },
    requireAuth(req, res, next) {
      if (typeof next === "function") next();
    },
    getJwks() {
      return { keys: [] };
    },
    async signToken() {
      return "access-token";
    },
    verifyToken(token) {
      return token === "access-token" ? { userId: "user-1" } : null;
    },
    async issueTokens() {
      return {
        accessToken: "access-token",
        refreshToken: "refresh-token",
      };
    },
    async generateRefreshToken() {
      return "refresh-token";
    },
    async refreshToken() {
      return {
        accessToken: "access-token",
        refreshToken: "refresh-token",
      };
    },
    oauth: {
      google: {
        redirect() {},
        async handleCallback() {
          const result = {
            profile: {
              email: "google@example.com",
              provider: "google",
              providerId: "google-user",
              email_verified: true,
            },
            mode: process.env.AUTHENIK8_TEST_OAUTH_MODE ?? "login",
            userId: process.env.AUTHENIK8_TEST_OAUTH_MODE === "link" ? "user-1" : null,
          };
          if (process.env.AUTHENIK8_TEST_IDENTITY_RESULT === "LINK_REQUIRED") {
            return {
              ...result,
              identity: { type: "LINK_REQUIRED", message: "please link manually" },
            };
          }
          if (result.mode === "link") {
            return { ...result, identity: { type: "LINK_PROVIDER", success: true } };
          }
          return {
            ...result,
            accessToken: "google-token",
            refreshToken: "google-refresh-token",
            identity: { type: "NEW_USER_CREATION" },
          };
        },
      },
      github: {
        redirect() {},
        async handleCallback() {
          const result = {
            profile: {
              email: "github@example.com",
              provider: "github",
              providerId: "github-user",
              email_verified: true,
            },
            mode: process.env.AUTHENIK8_TEST_OAUTH_MODE ?? "login",
            userId: process.env.AUTHENIK8_TEST_OAUTH_MODE === "link" ? "user-1" : null,
          };
          if (process.env.AUTHENIK8_TEST_IDENTITY_RESULT === "LINK_REQUIRED") {
            return {
              ...result,
              identity: { type: "LINK_REQUIRED", message: "please link manually" },
            };
          }
          if (result.mode === "link") {
            return { ...result, identity: { type: "LINK_PROVIDER", success: true } };
          }
          return {
            ...result,
            accessToken: "github-token",
            refreshToken: "github-refresh-token",
            identity: { type: "NEW_USER_CREATION" },
          };
        },
      },
    },
  };
}
`,
    );
  }

  await writePackageStub(
    targetDir,
    "dotenv",
    `export default {
  config() {
    return {};
  },
};
`,
  );
  const dotenvDir = path.join(targetDir, "node_modules", "dotenv");
  await fs.writeJson(
    path.join(dotenvDir, "package.json"),
    {
      name: "dotenv",
      type: "module",
      main: "./index.js",
      exports: {
        ".": "./index.js",
        "./config": "./config.js",
      },
    },
    { spaces: 2 },
  );
  await fs.writeFile(path.join(dotenvDir, "config.js"), "export {};\n");

  await writePackageStub(
    targetDir,
    "ioredis",
    `import { EventEmitter } from "node:events";

export class Redis extends EventEmitter {
  status = "ready";
  async ping() {
    return "PONG";
  }
  disconnect() {}
}
export default Redis;
`,
  );

  await writePackageStub(
    targetDir,
    "ioredis-mock",
    `export default class RedisMock {}
`,
  );

  if (options.realExpress) {
    await fs.ensureSymlink(
      path.join(repoRoot, "node_modules", "express"),
      path.join(targetDir, "node_modules", "express"),
      "junction",
    );
  } else {
    await writePackageStub(
      targetDir,
      "express",
      `function createRouter() {
  return {
    get() {},
    post() {},
    delete() {},
    use() {},
  };
}

function express() {
  return {
    get() {},
    use() {},
    listen(_port, callback) {
      if (typeof callback === "function") callback();
      return {
        close() {},
      };
    },
  };
}

express.json = function json() {
  return function jsonMiddleware(_req, _res, next) {
    if (typeof next === "function") next();
  };
};

express.Router = createRouter;

export const Router = createRouter;
export default express;
`,
    );
  }

  await writePackageStub(
    targetDir,
    "@prisma/client",
    `export class PrismaClient {
  constructor() {
    globalThis.__generatedPrismaUsers ??= new Map();
    this.user = {
      async create({ data }) {
        const user = { id: "user-1", role: "USER", ...data };
        globalThis.__generatedPrismaUsers.set(user.email, user);
        return user;
      },
      async findUnique({ where }) {
        if (where?.id) {
          return [...globalThis.__generatedPrismaUsers.values()].find(
            (user) => user.id === where.id,
          ) ?? null;
        }
        if (!where?.email) {
          return null;
        }
        return globalThis.__generatedPrismaUsers.get(where.email) ?? null;
      },
    };
    this.identityProvider = {
      async findUnique() {
        return null;
      },
      async upsert({ create }) {
        globalThis.__authenik8LinkedIdentity = create;
        return create;
      },
    };
  }
}
`,
  );

  await writePackageStub(
    targetDir,
    "@prisma/adapter-pg",
    `export class PrismaPg {}
`,
  );

  await writePackageStub(
    targetDir,
    "@prisma/adapter-libsql",
    `export class PrismaLibSql {}
`,
  );

  await writePackageStub(
    targetDir,
    "bcryptjs",
    `export default {
  async hash(value) {
    return "hashed:" + value;
  },
  async compare(value, hash) {
    return hash === "hashed:" + value;
  },
};
`,
  );

}

export async function runGeneratedServerSmoke(
  targetDir: string,
  entryPath: string,
  environment: NodeJS.ProcessEnv = {},
) {
  await installGeneratedAppStubs(targetDir);

  const generatedEnv = Object.fromEntries(
    (await fs.readFile(path.join(targetDir, ".env"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const name = line.slice(0, separator);
        const rawValue = line.slice(separator + 1);
        const value = rawValue.length >= 2 && (
          (rawValue.startsWith("'") && rawValue.endsWith("'"))
          || (rawValue.startsWith('"') && rawValue.endsWith('"'))
        ) ? rawValue.slice(1, -1) : rawValue;
        return [name, value];
      }),
  );

  const smokeScriptPath = path.join(targetDir, "smoke-runner.mjs");
  const smokeResultPath = path.join(targetDir, "smoke-result.json");
  const entryImportPath = `./${toPosixPath(entryPath)}`;

  await fs.writeFile(
    smokeScriptPath,
    `import { writeFile } from "node:fs/promises";

const stdout = [];
const stderr = [];
const format = (values) => values.map((value) => String(value)).join(" ");
console.log = (...values) => stdout.push(format(values));
console.error = (...values) => stderr.push(format(values));
process.exit = (code) => {
  failed = true;
  process.exitCode = typeof code === "number" ? code : 1;
};
globalThis.setInterval = () => ({ unref() {} });
process.memoryUsage = () => ({ heapUsed: 32 * 1024 * 1024 });

let failed = false;
try {
  await import(${JSON.stringify(entryImportPath)});
  await new Promise((resolve) => setTimeout(resolve, 100));
} catch (error) {
  failed = true;
  stderr.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
}

await writeFile(${JSON.stringify(smokeResultPath)}, JSON.stringify({
  stdout: stdout.join("\\n"),
  stderr: stderr.join("\\n"),
}));
if (failed) process.exitCode = 1;
`,
  );

  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoaderUrl, smokeScriptPath], {
      cwd: targetDir,
      env: {
        ...process.env,
        ...generatedEnv,
        NODE_ENV: "test",
        REFRESH_SECRET: "test-refresh-secret-must-be-at-least-32-characters",
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
        GOOGLE_REDIRECT_URI: "https://example.com/auth/google/callback",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
        GITHUB_REDIRECT_URI: "https://example.com/auth/github/callback",
        ...environment,
      },
      stdio: "ignore",
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Generated server smoke test timed out for ${entryPath}`));
    }, 10_000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", async (code) => {
      clearTimeout(timeout);
      try {
        const report = await fs.readJson(smokeResultPath) as { stdout?: string; stderr?: string };
        resolve({
          code,
          stdout: normalizeText(report.stdout ?? ""),
          stderr: normalizeText(report.stderr ?? ""),
        });
      } catch {
        resolve({
          code,
          stdout: "",
          stderr: code === 0 ? "Smoke result was not written" : `Generated server exited with code ${code}`,
        });
      }
    });
  });
}
