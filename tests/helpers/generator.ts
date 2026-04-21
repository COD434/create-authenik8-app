import { spawn } from "child_process";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { vi } from "vitest";

import type { CliState } from "../../src/lib/types.js";
import { createProject, configurePackageJson } from "../../src/steps/createProject.js";
import { configurePrisma } from "../../src/steps/configurePrisma.js";
import { installAuth } from "../../src/steps/installAuth.js";
import { configureProduction } from "../../src/steps/finalSetup.js";
import * as hashUtils from "../../src/utils/hash.js";

type TemplateKind = "base" | "auth" | "auth-oauth";

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
  hashLib?: "argon2" | "bcryptjs";
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const templateRoot = path.join(repoRoot, "templates");
const tsxLoaderPath = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");

const templateToAuthMode: Record<TemplateKind, CliState["authMode"]> = {
  base: "base",
  auth: "auth",
  "auth-oauth": "auth-oauth",
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
  };

  await createProject(state, targetDir, templateRoot);

  let hashLib: string | undefined;

  if (state.authMode !== "base") {
    const hashSpy = vi
      .spyOn(hashUtils, "getBestHashLib")
      .mockReturnValue(options.hashLib ?? "bcryptjs");

    try {
      hashLib = await installAuth(targetDir, "npm");
    } finally {
      hashSpy.mockRestore();
    }
  }

  await configurePrisma(state, targetDir, templateRoot);
  configurePackageJson(targetDir, state.usePrisma ?? false);

  if (options.productionRuntime) {
    await configureProduction(targetDir, state.projectName, options.productionRuntime);
  }

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

export async function installGeneratedAppStubs(targetDir: string): Promise<void> {
  await writePackageStub(
    targetDir,
    "authenik8-core",
    `export async function createAuthenik8(config) {
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
    signToken() {
      return "access-token";
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
          return { accessToken: "google-token" };
        },
      },
      github: {
        redirect() {},
        async handleCallback() {
          return { accessToken: "github-token" };
        },
      },
    },
  };
}
`,
  );

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

  await writePackageStub(
    targetDir,
    "express",
    `function createRouter() {
  return {
    get() {},
    post() {},
    use() {},
  };
}

function express() {
  return {
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

  await writePackageStub(
    targetDir,
    "@prisma/client",
    `export class PrismaClient {
  constructor() {
    this.user = {
      async create({ data }) {
        return { id: "user-1", ...data };
      },
      async findUnique({ where }) {
        if (!where?.email) {
          return null;
        }
        return {
          id: "user-1",
          email: where.email,
          password: "hashed:password",
        };
      },
    };
  }
}
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

  await writePackageStub(
    targetDir,
    "argon2",
    `export default {
  async hash(value) {
    return "hashed:" + value;
  },
  async verify(hash, value) {
    return hash === "hashed:" + value;
  },
};
`,
  );
}

export async function runGeneratedServerSmoke(targetDir: string, entryPath: string) {
  await installGeneratedAppStubs(targetDir);

  const smokeScriptPath = path.join(targetDir, "smoke-runner.mjs");
  const entryImportPath = `./${toPosixPath(entryPath)}`;

  await fs.writeFile(
    smokeScriptPath,
    `globalThis.setInterval = () => ({ unref() {} });
process.memoryUsage = () => ({ heapUsed: 32 * 1024 * 1024 });
await import(${JSON.stringify(entryImportPath)});
`,
  );

  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoaderPath, smokeScriptPath], {
      cwd: targetDir,
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: "test-jwt-secret",
        REFRESH_SECRET: "test-refresh-secret",
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Generated server smoke test timed out for ${entryPath}`));
    }, 10_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({
        code,
        stdout: normalizeText(stdout),
        stderr: normalizeText(stderr),
      });
    });
  });
}
