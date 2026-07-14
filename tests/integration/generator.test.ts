import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { configurePrisma } from "../../src/steps/configurePrisma.js";

import {
  generateProjectFixture,
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
        "src/prisma/client.ts",
        "prisma/schema.prisma",
        "prisma.config.ts",
      ]);

      expect(pkg.scripts.postinstall).toBe("prisma generate");
      expect(pkg.scripts.dev).toContain("prisma generate");
      expect(pkg.dependencies["@prisma/client"]).toBe("7.8.0");
      expect(pkg.dependencies.zod).toBe("^4.4.3");
      expect(pkg.dependencies["@prisma/adapter-better-sqlite3"]).toBe("7.8.0");
      expect(pkg.dependencies["@prisma/adapter-pg"]).toBeUndefined();
      expect(pkg.devDependencies.prisma).toBe("7.8.0");
      expect(pkg.overrides["@hono/node-server"]).toBe("1.19.13");
      expect(pkg.engines.node).toBe("^20.19 || ^22.12 || >=24");
      expect(files["app.ts"]).toContain("app.use(auth.helmet)");
      expect(files["routes/base.routes.ts"]).toContain('router.get("/protected"');
      expect(files["src/prisma/client.ts"]).toContain("new PrismaBetterSqlite3");
      expect(files["prisma/schema.prisma"]).toContain('provider = "sqlite"');
      expect(files["prisma.config.ts"]).toContain('url: env("DATABASE_URL")');
    } finally {
      await project.cleanup();
    }
  });

  it("generates a base template without Prisma dependencies or scripts", async () => {
    const project = await generateProjectFixture({
      template: "base",
      usePrisma: false,
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [".env", ".env.example", "README.md"]);

      expect(pkg.name).toBe("generated-app");
      expect(pkg.scripts.postinstall).toBeUndefined();
      expect(pkg.scripts["prisma:migrate"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/client"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-pg"]).toBeUndefined();
      expect(pkg.dependencies["@prisma/adapter-better-sqlite3"]).toBeUndefined();
      expect(pkg.devDependencies.prisma).toBeUndefined();
      expect(pkg.engines.node).toBe(">=18.0.0");
      expect(pkg.devDependencies["@types/express"]).toBeDefined();
      expect(pkg.scripts.start).toBe("node dist/src/server.js");
      expect(await fs.pathExists(`${project.targetDir}/prisma/schema.prisma`)).toBe(false);
      expect(await fs.pathExists(`${project.targetDir}/prisma.config.ts`)).toBe(false);
      expect(files[".env"]).toContain("JWT_SECRET=");
      expect(files[".env.example"]).not.toContain("DATABASE_URL");
      expect(files["README.md"]).not.toContain("prisma:migrate");
    } finally {
      await project.cleanup();
    }
  });

  it("writes pnpm and Bun build approvals for Prisma dependencies", async () => {
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

      expect(pnpmConfig).toContain('"@prisma/engines": true');
      expect(pnpmConfig).toContain("better-sqlite3: true");
      expect(pnpmConfig).toContain('"@hono/node-server": "1.19.13"');
      expect(bunPkg.trustedDependencies).toEqual([
        "@prisma/engines",
        "better-sqlite3",
        "prisma",
      ]);
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

  it("generates the email/password template with a mocked bcrypt hash module", async () => {
    const project = await generateProjectFixture({
      template: "auth",
      database: "postgresql",
      hashLib: "bcryptjs",
    });

    try {
      const pkg = await fs.readJson(`${project.targetDir}/package.json`);
      const files = await readProjectFiles(project.targetDir, [
        "src/app.ts",
        "src/routes/auth.routes.ts",
        "src/routes/protected.routes.ts",
        "src/prisma/client.ts",
        "src/utils/hash.ts",
        "prisma/schema.prisma",
        "prisma.config.ts",
      ]);

      expect(project.hashLib).toBe("bcryptjs");
      expect(pkg.dependencies.bcryptjs).toBe("^2.4.3");
      expect(pkg.devDependencies["@types/bcryptjs"]).toBe("^2.4.6");
      expect(pkg.dependencies.zod).toBe("^4.4.3");
      expect(pkg.dependencies.ioredis).toBe("^5.8.1");
      expect(pkg.dependencies["@prisma/adapter-pg"]).toBe("7.8.0");
      expect(pkg.dependencies["@prisma/adapter-better-sqlite3"]).toBeUndefined();
      expect(files["src/app.ts"]).toContain('app.use("/auth", createAuthRoutes(auth))');
      expect(files["src/routes/auth.routes.ts"]).toContain('router.post("/register"');
      expect(files["src/utils/hash.ts"]).toContain('import bcrypt from "bcryptjs"');
      expect(files["src/prisma/client.ts"]).toContain("new PrismaPg");
      expect(files["prisma/schema.prisma"]).toContain('provider = "postgresql"');
      expect(files["prisma.config.ts"]).toContain('url: env("DATABASE_URL")');
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
        "src/auth/routes/oauth.routes.ts",
        "src/auth/controllers/password.controller.ts",
        "src/auth/routes/password.route.ts",
        "ecosystem.config.js",
      ]);

      expect(pkg.dependencies.pm2).toBe("^5.4.2");
      expect(pkg.devDependencies["@types/bcryptjs"]).toBe("^2.4.6");
      expect(pkg.dependencies.zod).toBe("^4.4.3");
      expect(pkg.dependencies["ts-node"]).toBe("^10.9.2");

      expect(pkg.dependencies["authenik8-core"]).toBe("^1.0.38");

      expect(pkg.scripts["docker:up"]).toBe("docker compose up -d");
      expect(pkg.scripts["pm2:start"]).toBe("npx pm2 start ecosystem.config.js");
      expect(files["src/auth/auth.ts"]).toContain('redirectUri: requiredEnv("GOOGLE_REDIRECT_URI")');
      expect(files["src/auth/auth.ts"]).toContain('redirectUri: requiredEnv("GITHUB_REDIRECT_URI")');
      expect(files["src/auth/routes/oauth.routes.ts"]).toContain('router.get("/github/callback"');
      expect(files["src/auth/routes/password.route.ts"]).toContain("passwordController.login");
      expect(files["src/auth/controllers/password.controller.ts"]).toContain("generateRefreshToken");
      expect(files["ecosystem.config.js"]).toContain('interpreter_args: "-r ts-node/register"');
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
      ]);

      expect(files["README.md"]).toContain("POST /auth/login");
      expect(files["README.md"]).toContain("AUTHENIK8_OAUTH_PROVIDERS=google");
      expect(files["README.md"]).toContain("3-Minute Verification");
      expect(files["README.md"]).toContain("Troubleshooting");
      expect(files["README.md"]).toContain("OAuth Callback Setup");
      expect(files["README.md"]).toContain("Frontend Use");
      expect(files["README.md"]).toContain("Threat Model");
      expect(files["THREAT_MODEL.md"]).toContain("Threats Addressed");
      expect(files["THREAT_MODEL.md"]).toContain("Threats Not Fully Addressed");
      expect(files["THREAT_MODEL.md"]).toContain("Refresh-token replay");
      expect(files["docker-compose.yml"]).toContain("redis:7-alpine");
      expect(files["docker-compose.yml"]).toContain("postgres:16-alpine");
      expect(files[".env"]).toContain('AUTHENIK8_OAUTH_PROVIDERS="google"');
      expect(files[".env"]).toContain("GOOGLE_CLIENT_ID");
      expect(files[".env"]).not.toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).toContain("dev-jwt-secret-change-before-production");
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
    });

    try {
      const files = await readProjectFiles(project.targetDir, [
        "src/auth/auth.ts",
        "src/auth/routes/oauth.routes.ts",
        "src/auth/controllers/oauth.controller.ts",
        "README.md",
        ".env",
      ]);

      expect(files["src/auth/auth.ts"]).toContain('github: {');
      expect(files["src/auth/auth.ts"]).toContain('requiredEnv("GITHUB_CLIENT_ID")');
      expect(files["src/auth/auth.ts"]).not.toContain('requiredEnv("GOOGLE_CLIENT_ID")');
      expect(files["src/auth/routes/oauth.routes.ts"]).toContain('router.get("/github"');
      expect(files["src/auth/routes/oauth.routes.ts"]).not.toContain('router.get("/google"');
      expect(files["src/auth/controllers/oauth.controller.ts"]).toContain('githubRedirect');
      expect(files["src/auth/controllers/oauth.controller.ts"]).not.toContain('googleRedirect');
      expect(files["README.md"]).toContain("AUTHENIK8_OAUTH_PROVIDERS=github");
      expect(files["README.md"]).toContain("GET /auth/github");
      expect(files["README.md"]).not.toContain("GET /auth/google");
      expect(files["README.md"]).toContain("loginWithGitHub");
      expect(files["README.md"]).not.toContain("loginWithGoogle");
      expect(files[".env"]).toContain('AUTHENIK8_OAUTH_PROVIDERS="github"');
      expect(files[".env"]).toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).not.toContain("GOOGLE_CLIENT_ID");
    } finally {
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
        "apps/api/prisma/schema.prisma",
        "apps/api/src/config/prisma.ts",
        "apps/api/src/auth/cookies.ts",
        "apps/api/src/modules/projects/project.policy.ts",
        "apps/web/src/auth/AuthProvider.tsx",
        "apps/web/src/auth/providers.ts",
        "apps/web/vite.config.ts",
        "packages/api-client/src/index.ts",
        ".env",
      ]);

      expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
      expect(pkg.scripts.dev).toContain("concurrently");
      expect(pkg.scripts.dev).toContain("@authenik8/contracts");
      expect(pkg.scripts.dev).toContain("@authenik8/api-client");
      expect(pkg.scripts.dev).toContain("@authenik8/ui");
      expect(pkg.scripts.postinstall).toBeUndefined();
      const apiPkg = JSON.parse(files["apps/api/package.json"]);
      expect(apiPkg.dependencies["@prisma/client"]).toBe("7.8.0");
      expect(apiPkg.dependencies["@prisma/adapter-pg"]).toBe("7.8.0");
      expect(apiPkg.dependencies.zod).toBe("^4.4.3");
      expect(apiPkg.devDependencies.prisma).toBe("7.8.0");
      expect(pkg.overrides["@hono/node-server"]).toBe("1.19.13");
      expect(files["PRESET_CONTRACT.md"]).toContain("Access tokens exist only in module memory");
      expect(files["apps/api/prisma.config.ts"]).toContain('url: env("DATABASE_URL")');
      expect(files["apps/api/prisma/schema.prisma"]).toContain("model Project");
      expect(files["apps/api/src/config/prisma.ts"]).toContain("new PrismaPg");
      expect(files["apps/api/src/auth/cookies.ts"]).toContain('httpOnly: true');
      expect(files["apps/api/src/modules/projects/project.policy.ts"]).toContain("project.ownerId === actor.userId");
      expect(files["apps/web/src/auth/AuthProvider.tsx"]).toContain("authApi.restore()");
      expect(files["apps/web/src/auth/providers.ts"]).toContain("readonly OAuthProvider[]");
      expect(files["apps/web/src/auth/providers.ts"]).toContain('["google","github"]');
      expect(files["apps/web/vite.config.ts"]).toContain("preview:");
      expect(files["apps/web/vite.config.ts"]).toContain("proxy: apiProxy");
      expect(files["packages/api-client/src/index.ts"]).toContain("registerSchema.parse(input)");
      expect(files["packages/api-client/src/index.ts"]).not.toMatch(/localStorage|sessionStorage/);
      expect(files[".env"]).toContain("DATABASE_URL=postgresql://");
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

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(scenario.expectedOutput);
    } finally {
      await project.cleanup();
    }
  });
});
