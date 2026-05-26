import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import {
  generateProjectFixture,
  readProjectFiles,
  runGeneratedServerSmoke,
} from "../helpers/generator.js";

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
        "prisma/schema.prisma",
      ]);

      expect(pkg.scripts.postinstall).toBe("npx prisma@5.22.0 generate");
      expect(pkg.scripts.dev).toContain("npx prisma@5.22.0 generate");
      expect(pkg.dependencies["@prisma/client"]).toBe("5.22.0");
      expect(files["app.ts"]).toContain("app.use(auth.helmet)");
      expect(files["routes/base.routes.ts"]).toContain('router.get("/protected"');
      expect(files["prisma/schema.prisma"]).toContain('provider = "sqlite"');
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
        "src/utils/hash.ts",
        "prisma/schema.prisma",
      ]);

      expect(project.hashLib).toBe("bcryptjs");
      expect(pkg.dependencies.bcryptjs).toBe("^2.4.3");
      expect(pkg.dependencies.ioredis).toBe("^5.8.1");
      expect(files["src/app.ts"]).toContain('app.use("/auth", createAuthRoutes(auth))');
      expect(files["src/routes/auth.routes.ts"]).toContain('router.post("/register"');
      expect(files["src/utils/hash.ts"]).toContain('import bcrypt from "bcryptjs"');
      expect(files["prisma/schema.prisma"]).toContain('provider = "postgresql"');
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
        "src/auth/oauth.routes.ts",
        "src/auth/password.controller.ts",
        "src/auth/password.route.ts",
        "ecosystem.config.js",
      ]);

      expect(pkg.dependencies.pm2).toBe("^5.4.2");
      expect(pkg.dependencies["ts-node"]).toBe("^10.9.2");

      expect(pkg.dependencies["authenik8-core"]).toBe("^1.0.33");

      expect(pkg.scripts["docker:up"]).toBe("docker compose up -d");
      expect(pkg.scripts["pm2:start"]).toBe("npx pm2 start ecosystem.config.js");
      expect(files["src/auth/auth.ts"]).toContain('redirectUri: requiredEnv("GOOGLE_REDIRECT_URI")');
      expect(files["src/auth/auth.ts"]).toContain('redirectUri: requiredEnv("GITHUB_REDIRECT_URI")');
      expect(files["src/auth/oauth.routes.ts"]).toContain('router.get("/github/callback"');
      expect(files["src/auth/password.route.ts"]).toContain("passwordController.login");
      expect(files["src/auth/password.controller.ts"]).toContain("generateRefreshToken");
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
        "src/auth/oauth.routes.ts",
        "src/auth/oauth.controller.ts",
        "README.md",
        ".env",
      ]);

      expect(files["src/auth/auth.ts"]).toContain('github: {');
      expect(files["src/auth/auth.ts"]).toContain('requiredEnv("GITHUB_CLIENT_ID")');
      expect(files["src/auth/auth.ts"]).not.toContain('requiredEnv("GOOGLE_CLIENT_ID")');
      expect(files["src/auth/oauth.routes.ts"]).toContain('router.get("/github"');
      expect(files["src/auth/oauth.routes.ts"]).not.toContain('router.get("/google"');
      expect(files["src/auth/oauth.controller.ts"]).toContain('githubRedirect');
      expect(files["src/auth/oauth.controller.ts"]).not.toContain('googleRedirect');
      expect(files["README.md"]).toContain("AUTHENIK8_OAUTH_PROVIDERS=github");
      expect(files["README.md"]).toContain("GET /auth/github");
      expect(files["README.md"]).not.toContain("GET /auth/google");
      expect(files[".env"]).toContain('AUTHENIK8_OAUTH_PROVIDERS="github"');
      expect(files[".env"]).toContain("GITHUB_CLIENT_ID");
      expect(files[".env"]).not.toContain("GOOGLE_CLIENT_ID");
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
