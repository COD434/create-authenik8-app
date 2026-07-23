import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { configurePrisma } from "../../src/steps/configurePrisma.js";
import { createProject } from "../../src/steps/createProject.js";

import {
  generateProjectFixture,
  installGeneratedAppStubs,
  readProjectFiles,
  runGeneratedServerSmoke,
} from "../helpers/generator.ts";

describe("generator happy paths", () => {
  it("generates the base template with Prisma SQLite wiring", async () => {
    const project = await generateProjectFixture({
      template: "base",
      database: "sqlite",
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [
        "app.ts",
        "routes/base.routes.ts",
        "src/server.ts",
        "src/config/redis.ts",
        "src/prisma/client.ts",
        "prisma/schema.prisma",
        "prisma.config.ts",
        "docker-compose.yml",
        ".env",
        ".env.example",
        "authenik8.json",
      ]);

      expect(pkg.scripts.postinstall).toBe("prisma generate");
      expect(pkg.scripts.dev).toContain("prisma generate");
      expect(pkg.scripts["db:migrate"]).toBe(
        "prisma db push && prisma generate",
      );
      expect(pkg.dependencies["@prisma/client"]).toBe("7.8.0");
      expect(pkg.devDependencies["ioredis-mock"]).toBe("8.13.1");
      expect(pkg.dependencies.zod).toBe("^4.4.3");
      expect(pkg.dependencies["@prisma/adapter-libsql"]).toBe("7.8.0");
      expect(pkg.dependencies["@prisma/adapter-better-sqlite3"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-pg"]).toBeUndefined();
      expect(pkg.devDependencies.prisma).toBe("7.8.0");
      expect(pkg.overrides["@hono/node-server"]).toBe("1.19.13");
      expect(pkg.allowScripts).toEqual({
        "prisma@7.8.0": true,
        "@prisma/engines@7.8.0": true,
      });
      expect(pkg.engines.node).toBe("^20.19 || ^22.12 || >=24");
      expect(files["app.ts"]).toContain("app.use(auth.helmet)");
      expect(files["routes/base.routes.ts"]).toContain('router.get("/protected"');
      expect(files["src/server.ts"]).toContain("redis: await createRedisClient()");
      expect(files["src/config/redis.ts"]).toContain("redisUrl === localRedisUrl");
      expect(files["src/config/redis.ts"]).toContain(
        'process.env.NODE_ENV?.trim() === "production"',
      );
      expect(files["src/prisma/client.ts"]).toContain("new PrismaLibSql");
      expect(files["prisma/schema.prisma"]).toContain('provider = "sqlite"');
      expect(files["prisma.config.ts"]).toContain('url: env("DATABASE_URL")');
      expect(files["docker-compose.yml"]).toContain("redis-cli");
      expect(files["docker-compose.yml"]).not.toContain("postgres:16-alpine");
      expect(files[".env"]).not.toMatch(/^(GOOGLE|GITHUB)_/m);
      expect(files[".env.example"]).not.toMatch(/^(GOOGLE|GITHUB)_/m);
      expect(JSON.parse(files["authenik8.json"])).toMatchObject({
        schemaVersion: 1,
        preset: "base",
        packageManager: "npm",
        database: "sqlite",
        engine: { package: "authenik8-core", version: "2.0.3" },
        features: { prisma: true, oauthProviders: [], pm2: false },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("generates a base template without Prisma dependencies or scripts", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: false,
      templateLineEndings: "crlf",
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [
        ".env",
        ".env.example",
        ".gitignore",
        "AGENT_IDENTITY.md",
        "authenik8.json",
        "README.md",
      ]);

      expect(pkg.name).toBe("generated-app");
      expect(pkg.scripts.postinstall).toBeUndefined();
      expect(pkg.scripts["db:migrate"]).toBeUndefined();
      expect(pkg.scripts["prisma:migrate"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/client"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-pg"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-libsql"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-better-sqlite3"]).toBeUndefined();
      expect(pkg.devDependencies.prisma).toBeUndefined();
      expect(pkg.allowScripts).toBeUndefined();
      expect(pkg.engines.node).toBe("^20.19 || ^22.12 || >=24");
      expect(pkg.devDependencies["@types/express"]).toBeDefined();
      expect(pkg.scripts.start).toBe("node dist/src/server.js");
      expect(await fs.pathExists(`${project.targetDir}/prisma/schema.prisma`)).toBe(false);
      expect(await fs.pathExists(`${project.targetDir}/prisma.config.ts`)).toBe(false);
      expect(files[".env"]).toContain("AUTHENIK8_SIGNING_JWKS='[");
      expect(files[".env"]).toContain("AUTHENIK8_ACTIVE_KID=");
      expect(files[".env"]).toContain("AUTHENIK8_ISSUER=http://localhost:3000");
      expect(files[".env"]).toContain("AUTHENIK8_AGENTS={}");
      expect(files[".env"]).toContain("REDIS_URL=memory://");
      expect(files[".gitignore"]).toContain(".env");
      expect(files["AGENT_IDENTITY.md"]).toContain("Agent and service identity");
      expect(files["AGENT_IDENTITY.md"]).toContain("Do not expose it as an unauthenticated HTTP route");
      expect(await fs.pathExists(`${project.targetDir}/gitignore.template`)).toBe(false);
      expect(files[".env.example"]).not.toContain("DATABASE_URL");
      expect(files[".env.example"]).toContain("REDIS_URL=memory://");
      expect(files["README.md"]).not.toContain("db:migrate");
    } finally {
      await project.cleanup();
    }
  });

  it("writes only the Prisma build approvals required by pnpm and Bun", async () => {
    const pnpmProject = await generateProjectFixture({
      template: "base",
      database: "sqlite",
      packageManager: "pnpm",
    });
    const bunProject = await generateProjectFixture({
      template: "base",
      database: "sqlite",
      packageManager: "bun",
    });

    try {
      const pnpmConfig = await fs.readFile(`${pnpmProject.targetDir}/pnpm-workspace.yaml`, "utf8");
      const bunPkg = await fs.readJson(`${bunProject.targetDir}/package.json`);
      const pnpmReadme = await fs.readFile(`${pnpmProject.targetDir}/README.md`, "utf8");
      const bunReadme = await fs.readFile(`${bunProject.targetDir}/README.md`, "utf8");

      expect(pnpmConfig).toContain('"@prisma/engines": true');
      expect(pnpmConfig).not.toContain("better-sqlite3");
      expect(pnpmConfig).toContain('"@hono/node-server": "1.19.13"');
      expect(bunPkg.trustedDependencies).toEqual([
        "@prisma/engines",
        "prisma",
      ]);
      expect(pnpmReadme).toContain("pnpm run db:migrate");
      expect(pnpmReadme).toContain("pnpm dlx create-authenik8-app@latest doctor");
      expect(pnpmReadme).not.toMatch(/\bnpm (?:install|run)\b|\bnpx\b/);
      expect(bunReadme).toContain("bun run db:migrate");
      expect(bunReadme).toContain("bunx create-authenik8-app@latest doctor");
      expect(bunReadme).not.toMatch(/\bnpm (?:install|run)\b|\bnpx\b/);
    } finally {
      await Promise.all([pnpmProject.cleanup(), bunProject.cleanup()]);
    }
  });

  it("propagates Prisma configuration failures", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: false,
    });

    try {
      await expect(configurePrisma(
        { ...project.state, usePrisma: true },
        project.targetDir,
        `${project.rootDir}/missing-templates`,
      )).rejects.toThrow();
    } finally {
      await project.cleanup();
    }
  });

  it("leaves no partial destination when project creation fails", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-atomic-test-"));
    const fixtureTemplates = path.join(rootDir, "templates");
    const targetDir = path.join(rootDir, "generated-app");

    try {
      await fs.copy(
        path.resolve("templates/express-base"),
        path.join(fixtureTemplates, "express-base"),
      );

      await expect(createProject({
        step: "prompts",
        projectName: "generated-app",
        authMode: "base",
        usePrisma: false,
        useGit: false,
      }, targetDir, fixtureTemplates)).rejects.toThrow("THREAT_MODEL.md");

      expect(await fs.pathExists(targetDir)).toBe(false);
      expect((await fs.readdir(rootDir)).some((entry) => entry.includes(".authenik8-"))).toBe(false);
    } finally {
      await fs.remove(rootDir);
    }
  });

  it("generates the email/password template with a mocked bcrypt hash module", async () => {
    const project = await generateProjectFixture({
      template: "auth",
      database: "postgresql",
      hashLib: "bcryptjs",
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [
        "src/server.ts",
        "src/app.ts",
        "src/config/redis.ts",
        "src/routes/auth.routes.ts",
        "src/routes/protected.routes.ts",
        "src/prisma/client.ts",
        "src/utils/hash.ts",
        "prisma/schema.prisma",
        "prisma.config.ts",
        "docker-compose.yml",
        ".env",
        ".env.example",
      ]);

      expect(project.hashLib).toBe("bcryptjs");
      expect(pkg.dependencies.bcryptjs).toBe("^2.4.3");
      expect(pkg.devDependencies["@types/bcryptjs"]).toBe("^2.4.6");
      expect(pkg.devDependencies["ioredis-mock"]).toBe("8.13.1");
      expect(pkg.scripts["db:migrate"]).toBe(
        "prisma db push && prisma generate",
      );
      expect(pkg.dependencies.zod).toBe("^4.4.3");
      expect(pkg.dependencies.ioredis).toBe("^5.8.1");
      expect(pkg.dependencies["@prisma/adapter-pg"]).toBe("7.8.0");
      expect(pkg.dependencies["@prisma/adapter-libsql"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-better-sqlite3"]).toBeUndefined();
      expect(pkg.allowScripts).toEqual({
        "prisma@7.8.0": true,
        "@prisma/engines@7.8.0": true,
      });
      expect(files["src/app.ts"]).toContain('app.use("/auth", createAuthRoutes(auth))');
      expect(files["src/server.ts"]).toContain("redis: await createRedisClient()");
      expect(files["src/config/redis.ts"]).toContain('import("ioredis-mock")');
      expect(files["src/routes/auth.routes.ts"]).toContain('router.post("/register"');
      expect(files["src/utils/hash.ts"]).toContain('import bcrypt from "bcryptjs"');
      expect(files["src/prisma/client.ts"]).toContain("new PrismaPg");
      expect(files["prisma/schema.prisma"]).toContain('provider = "postgresql"');
      expect(files["prisma.config.ts"]).toContain('url: env("DATABASE_URL")');
      expect(files["docker-compose.yml"]).toContain("postgres:16-alpine");
      expect(files["docker-compose.yml"]).toContain("pg_isready");
      expect(files[".env"]).not.toMatch(/^(GOOGLE|GITHUB)_/m);
      expect(files[".env.example"]).not.toMatch(/^(GOOGLE|GITHUB)_/m);
    } finally {
      await project.cleanup();
    }
  });

  it("generates the OAuth template with production runtime files", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      database: "sqlite",
      hashLib: "bcryptjs",
      productionRuntime: "node",
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [
        "src/server.ts",
        "src/auth/auth.ts",
        "src/config/redis.ts",
        "src/auth/identity.adapter.ts",
        "src/auth/controllers/oauth.controller.ts",
        "src/auth/routes/oauth.routes.ts",
        "src/auth/controllers/password.controller.ts",
        "src/auth/routes/password.route.ts",
        "prisma/schema.prisma",
        "ecosystem.config.js",
      ]);

      expect(pkg.dependencies.pm2).toBe("^5.4.2");
      expect(pkg.devDependencies["@types/bcryptjs"]).toBe("^2.4.6");
      expect(pkg.devDependencies["ioredis-mock"]).toBe("8.13.1");
      expect(pkg.scripts["db:migrate"]).toBe(
        "prisma db push && prisma generate",
      );
      expect(pkg.dependencies.zod).toBe("^4.4.3");
      expect(pkg.dependencies["ts-node"]).toBeUndefined();

      expect(pkg.dependencies["authenik8-core"]).toBe("2.0.3");

      expect(pkg.scripts["docker:up"]).toBe("docker compose up -d --wait");
      expect(pkg.scripts["pm2:start"]).toBe("npm run build && npx pm2 start ecosystem.config.js");
      expect(files["src/auth/auth.ts"]).toContain('redirectUri: requiredEnv("GOOGLE_REDIRECT_URI")');
      expect(files["src/auth/auth.ts"]).toContain('redirectUri: requiredEnv("GITHUB_REDIRECT_URI")');
      expect(files["src/auth/auth.ts"]).toContain("identityAdapter");
      expect(files["src/auth/auth.ts"]).toContain("agentIdentityConfig()");
      expect(files["src/auth/auth.ts"]).toContain("redis: await createRedisClient()");
      expect(files["src/config/redis.ts"]).toContain('import("ioredis-mock")');
      expect(files["src/auth/routes/oauth.routes.ts"]).toContain('router.get("/github/callback"');
      expect(files["src/auth/routes/password.route.ts"]).toContain("passwordController.login");
      expect(files["src/auth/routes/password.route.ts"]).toContain("passwordController.refresh");
      expect(files["src/auth/controllers/password.controller.ts"]).toContain("await auth.issueTokens");
      expect(files["src/auth/controllers/oauth.controller.ts"]).toContain(
        'import { getAuth } from "../auth";',
      );
      expect(files["src/auth/controllers/oauth.controller.ts"]).not.toContain(
        'from "../auth.js"',
      );
      expect(files["src/auth/controllers/oauth.controller.ts"]).not.toContain("issueTokensFromProfile");
      expect(files["src/auth/identity.adapter.ts"]).toContain("identityProvider.upsert");
      expect(files["prisma/schema.prisma"]).toContain("model IdentityProvider");
      expect(files["prisma/schema.prisma"]).toContain("password  String?");
      expect(files["ecosystem.config.js"]).toContain('script: "dist/server.js"');
      expect(files["ecosystem.config.js"]).toContain('interpreter:"node"');
    } finally {
      await project.cleanup();
    }
  });

  it("writes generated docs, Docker Compose, and selected OAuth providers", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      database: "sqlite",
      hashLib: "bcryptjs",
      oauthProviders: ["google"],
    });

    try {
      const files = await readProjectFiles(project.targetDir, [
        "README.md",
        "THREAT_MODEL.md",
        "docker-compose.yml",
        ".env",
        ".env.example",
        ".gitignore",
      ]);

      expect(files["README.md"]).toContain("POST /auth/login");
      expect(files["README.md"]).toContain("providers selected during generation");
      expect(files["README.md"]).not.toContain("AUTHENIK8_OAUTH_PROVIDERS");
      expect(files["README.md"]).toContain("3-Minute Verification");
      expect(files["README.md"]).toContain("Troubleshooting");
      expect(files["README.md"]).toContain("OAuth Callback Setup");
      expect(files["README.md"]).toContain("Frontend Use");
      expect(files["README.md"]).toContain("Threat Model");
      expect(files["THREAT_MODEL.md"]).toContain("Threats Addressed");
      expect(files["THREAT_MODEL.md"]).toContain("Threats Not Fully Addressed");
      expect(files["THREAT_MODEL.md"]).toContain("Refresh-token replay");
      expect(files["docker-compose.yml"]).toContain("redis:7-alpine");
      expect(files["docker-compose.yml"]).toContain("redis-cli");
      expect(files["docker-compose.yml"]).not.toContain("postgres:16-alpine");
      expect(files["docker-compose.yml"]).not.toContain("postgres-data");
      expect(files[".env"]).toContain("GOOGLE_CLIENT_ID");
      expect(files[".env"]).not.toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).not.toContain("AUTHENIK8_OAUTH_PROVIDERS");
      expect(files[".env.example"]).toContain("GOOGLE_CLIENT_ID");
      expect(files[".env.example"]).not.toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).toContain("AUTHENIK8_SIGNING_JWKS='[");
      expect(files[".env"]).toContain("REDIS_URL=\"memory://\"");
      expect(files[".env"]).not.toContain("JWT_SECRET");
      expect(files[".gitignore"]).toContain(".env");
    } finally {
      await project.cleanup();
    }
  });


  it("generates GitHub-only OAuth files when only GitHub is selected", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      database: "sqlite",
      hashLib: "bcryptjs",
      oauthProviders: ["github"],
      templateLineEndings: "crlf",
    });

    try {
      const files = await readProjectFiles(project.targetDir, [
        "src/auth/auth.ts",
        "src/auth/routes/oauth.routes.ts",
        "src/auth/controllers/oauth.controller.ts",
        "README.md",
        ".env",
        ".env.example",
      ]);

      expect(files["src/auth/auth.ts"]).toContain('github: {');
      expect(files["src/auth/auth.ts"]).toContain('requiredEnv("GITHUB_CLIENT_ID")');
      expect(files["src/auth/auth.ts"]).not.toContain('requiredEnv("GOOGLE_CLIENT_ID")');
      expect(files["src/auth/routes/oauth.routes.ts"]).toContain('router.get("/github"');
      expect(files["src/auth/routes/oauth.routes.ts"]).not.toContain('router.get("/google"');
      expect(files["src/auth/controllers/oauth.controller.ts"]).toContain('githubRedirect');
      expect(files["src/auth/controllers/oauth.controller.ts"]).not.toContain('googleRedirect');
      expect(files["README.md"]).not.toContain("AUTHENIK8_OAUTH_PROVIDERS");
      expect(files["README.md"]).toContain("GET /auth/github");
      expect(files["README.md"]).not.toContain("GET /auth/google");
      expect(files["README.md"]).toContain("loginWithGitHub");
      expect(files["README.md"]).not.toContain("loginWithGoogle");
      expect(files[".env"]).toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).not.toContain("GOOGLE_CLIENT_ID");
      expect(files[".env.example"]).toContain("GITHUB_CLIENT_ID");
      expect(files[".env.example"]).not.toContain("GOOGLE_CLIENT_ID");
    } finally {
      await project.cleanup();
    }
  });

  it.each([
    {
      name: "uses sessions returned by the current core callback",
      mode: "login",
      expected: {
        accessToken: "google-token",
        refreshToken: "google-refresh-token",
      },
      status: 200,
    },
    {
      name: "returns an actionable conflict when explicit linking is required",
      mode: "login",
      identityResult: "LINK_REQUIRED",
      expected: {
        identity: { type: "LINK_REQUIRED", message: "please link manually" },
      },
      status: 409,
    },
  ])("OAuth callback $name", async ({
    mode,
    identityResult,
    expected,
    status,
  }) => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      database: "sqlite",
      hashLib: "bcryptjs",
      oauthProviders: ["google"],
    });

    try {
      await installGeneratedAppStubs(project.targetDir);
      vi.stubEnv("AUTHENIK8_TEST_OAUTH_MODE", mode);
      if (identityResult) vi.stubEnv("AUTHENIK8_TEST_IDENTITY_RESULT", identityResult);
      const generatedEnv = await fs.readFile(path.join(project.targetDir, ".env"), "utf8");
      const signingJwks = generatedEnv.match(/^AUTHENIK8_SIGNING_JWKS='(.+)'$/m)?.[1];
      const activeKid = generatedEnv.match(/^AUTHENIK8_ACTIVE_KID=(.+)$/m)?.[1];
      vi.stubEnv("AUTHENIK8_SIGNING_JWKS", signingJwks ?? "");
      vi.stubEnv("AUTHENIK8_ACTIVE_KID", activeKid ?? "");
      vi.stubEnv("AUTHENIK8_ISSUER", "http://localhost:3000");
      vi.stubEnv("AUTHENIK8_AUDIENCE", "generated-app-api");
      vi.stubEnv("REFRESH_SECRET", "test-refresh-secret-must-be-at-least-32-characters");
      vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
      vi.stubEnv("GOOGLE_REDIRECT_URI", "https://example.com/auth/google/callback");
      delete (globalThis as any).__authenik8LinkedIdentity;
      (globalThis as any).__generatedPrismaUsers = new Map([
        ["user@example.com", {
          id: "user-1",
          email: "user@example.com",
          password: "hashed:password",
        }],
      ]);

      const authUrl = pathToFileURL(path.join(project.targetDir, "src/auth/auth.js")).href;
      const controllerUrl = pathToFileURL(
        path.join(project.targetDir, "src/auth/controllers/oauth.controller.ts"),
      ).href;
      const authModule = await import(/* @vite-ignore */ authUrl);
      await authModule.initAuth();
      const { oauthController } = await import(/* @vite-ignore */ controllerUrl);
      const response = {
        headersSent: false,
        body: undefined as any,
        statusCode: 200,
        json(body: unknown) {
          this.body = body;
          return this;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
      };

      await oauthController.googleCallback({ query: {} }, response);

      expect(response.statusCode, JSON.stringify(response.body)).toBe(status);
      expect(response.body).toMatchObject(expected);
      if (mode === "link") {
        expect((globalThis as any).__authenik8LinkedIdentity).toEqual({
          userId: "user-1",
          provider: "google",
          providerId: "google-user",
        });
      }
    } finally {
      vi.unstubAllEnvs();
      delete (globalThis as any).__authenik8LinkedIdentity;
      delete (globalThis as any).__generatedPrismaUsers;
      await project.cleanup();
    }
  });

  it("generates the connected full-stack workspace without legacy package rewrites", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [
        "PRESET_CONTRACT.md",
        "apps/api/package.json",
        "apps/api/prisma.config.ts",
        "apps/api/prisma/migrations/20260721000000_init/migration.sql",
        "apps/api/prisma/migrations/migration_lock.toml",
        "apps/api/prisma/schema.prisma",
        "apps/api/src/app.ts",
        "apps/api/src/auth/auth.routes.ts",
        "apps/api/src/auth/authenik8.ts",
        "apps/api/src/config/env.ts",
        "apps/api/src/config/logger.ts",
        "apps/api/src/config/prisma.ts",
        "apps/api/src/auth/cookies.ts",
        "apps/api/src/auth/auth.service.ts",
        "apps/api/src/middleware/csrf.ts",
        "apps/api/src/modules/admin/admin.service.ts",
        "apps/api/src/modules/users/user.service.ts",
        "apps/api/src/modules/projects/project.policy.ts",
        "apps/web/package.json",
        "apps/web/src/auth/AuthProvider.tsx",
        "apps/web/src/auth/providers.ts",
        "apps/web/src/components/AppShell.tsx",
        "apps/web/src/components/AuthShell.tsx",
        "apps/web/src/main.tsx",
        "apps/web/src/pages/DashboardPage.tsx",
        "apps/web/src/pages/auth/LoginPage.tsx",
        "apps/web/vite.config.ts",
        "docker-compose.yml",
        "packages/api-client/src/index.ts",
        "README.md",
        "scripts/run-local.mjs",
        ".env",
        ".gitignore",
        "AGENT_IDENTITY.md",
        "authenik8.json",
      ]);

      expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
      expect(pkg.scripts.dev).toBe("node scripts/run-local.mjs dev");
      expect(pkg.scripts["dev:watch"]).toContain("concurrently");
      expect(pkg.scripts["dev:watch"]).toContain("@authenik8/contracts");
      expect(pkg.scripts["dev:watch"]).toContain("@authenik8/api-client");
      expect(pkg.scripts["dev:watch"]).toContain("@authenik8/ui");
      expect(pkg.scripts.setup).toBe("node scripts/run-local.mjs setup");
      expect(pkg.scripts["db:migrate"]).toBe("node scripts/run-local.mjs migrate");
      expect(pkg.scripts["db:seed"]).toBe("node scripts/run-local.mjs seed");
      expect(pkg.scripts["docker:up"]).toBe("docker compose up -d --wait");
      expect(pkg.scripts.pretypecheck).toBe("npm run build:packages");
      expect(pkg.devDependencies["@electric-sql/pglite"]).toBe("0.4.1");
      expect(pkg.devDependencies["@electric-sql/pglite-socket"]).toBe("0.1.1");
      expect(pkg.scripts.postinstall).toBeUndefined();
      expect(pkg.allowScripts).toEqual({
        "prisma@7.8.0": true,
        "@prisma/engines@7.8.0": true,
        esbuild: true,
      });
      const apiPkg = JSON.parse(files["apps/api/package.json"]);
      expect(apiPkg.dependencies["@prisma/client"]).toBe("7.8.0");
      expect(apiPkg.dependencies["@prisma/adapter-pg"]).toBe("7.8.0");
      expect(apiPkg.dependencies["express-rate-limit"]).toBeUndefined();
      expect(apiPkg.dependencies.zod).toBe("^4.4.3");
      expect(apiPkg.dependencies["ioredis-mock"]).toBe("8.13.1");
      expect(apiPkg.devDependencies.prisma).toBe("7.8.0");
      expect(apiPkg.scripts["prisma:migrate"]).toContain("prisma migrate deploy");
      expect(apiPkg.scripts.pretypecheck).toBe("prisma generate");
      expect(pkg.overrides["@hono/node-server"]).toBe("1.19.13");
      expect(files["PRESET_CONTRACT.md"]).toContain("Access tokens exist only in module memory");
      expect(files["apps/api/prisma.config.ts"]).toContain('url: env("DATABASE_URL")');
      expect(files["apps/api/prisma/schema.prisma"]).toContain("model Project");
      expect(files["apps/api/prisma/schema.prisma"]).toContain("coreSessionId String  @unique");
      expect(files["apps/api/prisma/migrations/migration_lock.toml"]).toContain('provider = "postgresql"');
      expect(files["apps/api/prisma/migrations/20260721000000_init/migration.sql"]).toContain('CREATE TABLE "User"');
      expect(files["apps/api/prisma/migrations/20260721000000_init/migration.sql"]).toContain('CREATE TABLE "Session"');
      expect(files["apps/api/src/config/prisma.ts"]).toContain("new PrismaPg");
      expect(files["apps/api/src/config/logger.ts"]).toContain('res.headers["set-cookie"]');
      expect(files["apps/api/src/config/logger.ts"]).toContain('req.headers["x-csrf-token"]');
      expect(files["apps/api/src/app.ts"]).toContain("app.use(getAuthenik8().rateLimit)");
      expect(files["apps/api/src/auth/cookies.ts"]).toContain('httpOnly: true');
      expect(files["apps/api/src/auth/cookies.ts"]).toContain("sealValue(");
      expect(files["apps/api/src/auth/auth.service.ts"]).toContain("getAuthenik8().revokeSession");
      expect(files["apps/api/src/auth/authenik8.ts"]).toContain("agentRegistry");
      expect(files["apps/api/src/auth/authenik8.ts"]).toContain("resolveAgent");
      expect(files["apps/api/src/auth/authenik8.ts"]).toContain("new RedisMock()");
      expect(files["apps/api/src/config/env.ts"]).toContain('environment.NODE_ENV === "production"');
      expect(files["apps/api/src/config/env.ts"]).toContain('environment.REDIS_URL === "memory://"');
      expect(files["apps/api/src/auth/auth.service.ts"]).not.toContain("redis.del(`refresh:");
      expect(files["apps/api/src/auth/auth.routes.ts"]).toContain('authRoutes.get("/csrf"');
      expect(files["apps/api/src/auth/auth.routes.ts"]).toContain("requireCsrf");
      expect(files["apps/api/src/middleware/csrf.ts"]).toContain("timingSafeEqual");
      expect(files["apps/api/src/modules/admin/admin.service.ts"]).toContain(
        "getAuthenik8().revokeAllSessions(targetId)",
      );
      expect(files["apps/api/src/modules/users/user.service.ts"]).toContain(
        "getAuthenik8().revokeSession(userId, session.coreSessionId)",
      );
      expect(files["apps/api/src/modules/projects/project.policy.ts"]).toContain("project.ownerId === actor.userId");
      expect(files["apps/web/src/auth/AuthProvider.tsx"]).toContain("authApi.restore()");
      expect(files["apps/web/src/auth/providers.ts"]).toContain("readonly OAuthProvider[]");
      expect(files["apps/web/src/auth/providers.ts"]).toContain('["google","github"]');
      const webPkg = JSON.parse(files["apps/web/package.json"]);
      expect(webPkg.dependencies["@astryxdesign/core"]).toBe("0.1.7");
      expect(webPkg.dependencies["@astryxdesign/theme-neutral"]).toBe("0.1.7");
      expect(files["apps/web/src/main.tsx"]).toContain("<Theme theme={neutralTheme} mode=\"light\">");
      expect(files["apps/web/src/main.tsx"].indexOf("@astryxdesign/core/astryx.css")).toBeLessThan(
        files["apps/web/src/main.tsx"].indexOf("./styles.css"),
      );
      expect(files["apps/web/src/components/AppShell.tsx"]).toContain("<AstryxAppShell");
      expect(files["apps/web/src/components/AppShell.tsx"]).toContain('src="/authenik8-logo.svg"');
      expect(files["apps/web/src/components/AppShell.tsx"]).toContain("onClick={() => void logout()}");
      expect(files["apps/web/src/components/AuthShell.tsx"]).toContain('from "@astryxdesign/core/Card"');
      expect(files["apps/web/src/components/AuthShell.tsx"]).toContain('src="/authenik8-logo.svg"');
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain('from "@astryxdesign/core/TextInput"');
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain('from "@astryxdesign/core/Banner"');
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain('autoComplete="email"');
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain('autoComplete="current-password"');
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain("await login({ email, password })");
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain('navigate(from ?? "/", { replace: true })');
      expect(files["apps/web/src/pages/auth/LoginPage.tsx"]).toContain('window.location.assign(`/api/auth/oauth/${provider}`)');
      expect(files["apps/web/src/pages/DashboardPage.tsx"]).toContain('queryKey: ["projects"]');
      expect(files["apps/web/src/pages/DashboardPage.tsx"]).toContain('queryKey: ["sessions"]');
      expect(files["apps/web/src/pages/DashboardPage.tsx"]).toContain('queryKey: ["health"]');
      expect(files["apps/web/src/pages/DashboardPage.tsx"]).toContain('navigate("/projects/new")');
      expect(files["apps/web/src/pages/DashboardPage.tsx"]).toContain('navigate("/settings/security")');
      expect(files["apps/web/vite.config.ts"]).toContain("preview:");
      expect(files["apps/web/vite.config.ts"]).toContain("proxy: apiProxy");
      expect(files["apps/web/vite.config.ts"]).toContain('"astryx-vendor"');
      expect(files["apps/web/vite.config.ts"]).toContain('"react-vendor"');
      expect(files["packages/api-client/src/index.ts"]).toContain("registerSchema.parse(input)");
      expect(files["packages/api-client/src/index.ts"]).not.toMatch(/localStorage|sessionStorage/);
      expect(files[".env"]).toContain("DATABASE_URL=postgresql://postgres:postgres@localhost:55432/");
      expect(files[".env"]).toContain("REDIS_URL=memory://");
      expect(files[".env"]).toContain("AUTHENIK8_LOCAL_DATABASE=embedded");
      expect(files[".env"]).toContain("AUTHENIK8_AGENTS={}");
      expect(files["docker-compose.yml"]).toContain('"127.0.0.1:55432:5432"');
      expect(files["docker-compose.yml"]).toContain('"127.0.0.1:56379:6379"');
      expect(files["scripts/run-local.mjs"]).toContain('import("@electric-sql/pglite")');
      expect(files["scripts/run-local.mjs"]).toContain('import("@electric-sql/pglite-socket")');
      expect(files["scripts/run-local.mjs"]).not.toMatch(/docker/i);
      expect(files["README.md"]).toContain("npm run dev");
      expect(files["README.md"]).toContain("applies the shipped migration");
      expect(files["README.md"]).toContain("admin@example.com");
      expect(files["README.md"]).toContain("ChangeMe123!");
      expect(files[".gitignore"]).toContain(".env");
      expect(files[".gitignore"]).toContain(".authenik8/");
      expect(files["AGENT_IDENTITY.md"]).toContain("issueDelegatedToken");
      expect(JSON.parse(files["authenik8.json"])).toMatchObject({
        schemaVersion: 1,
        preset: "fullstack",
        packageManager: "npm",
        runtime: "node",
        database: "postgresql",
        engine: { package: "authenik8-core", version: "2.0.3" },
        features: {
          prisma: true,
          oauthProviders: ["google", "github"],
          pm2: false,
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("keeps full-stack OAuth code and environment aligned with selected methods", async () => {
    const project = await generateProjectFixture({
      template: "fullstack",
      database: "postgresql",
      oauthProviders: ["github"],
    });

    try {
      const files = await readProjectFiles(project.targetDir, [
        "apps/web/src/auth/providers.ts",
        ".env",
        ".env.example",
      ]);

      expect(files["apps/web/src/auth/providers.ts"]).toContain('["github"]');
      expect(files[".env"]).toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).not.toContain("GOOGLE_CLIENT_ID");
      expect(files[".env.example"]).toContain("GITHUB_CLIENT_ID");
      expect(files[".env.example"]).not.toContain("GOOGLE_CLIENT_ID");
    } finally {
      await project.cleanup();
    }
  });

  it.each([
    {
      template: "base" as const,
      entryPath: "src/server.ts",
      expectedOutput: "Server running on http://localhost:3000",
    },
    {
      template: "auth" as const,
      entryPath: "src/server.ts",
      expectedOutput: "Server running on http://localhost:3000",
    },
    {
      template: "auth-oauth" as const,
      entryPath: "src/server.ts",
      expectedOutput: "Auth system running on http://localhost:3000",
    },
  ])("boots the generated $template server with mocked runtime packages", async (scenario) => {
    const project = await generateProjectFixture({
      template: scenario.template,
      hashLib: "bcryptjs",
    });

    try {
      const result = await runGeneratedServerSmoke(project.targetDir, scenario.entryPath);

      expect(result.code, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(scenario.expectedOutput);
    } finally {
      await project.cleanup();
    }
  });
});
