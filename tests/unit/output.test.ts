import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import type { CliState } from "../../src/lib/types.js";
import { printSummary, readSeedAdminCredentials } from "../../src/utils/output.js";

describe("completion output", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const baseState: CliState = {
    step: "done",
    projectName: "test-app",
    framework: "Express",
    authMode: "base",
    usePrisma: true,
    database: "sqlite",
    runtime: "node",
    useGit: true,
    packageManager: "npm",
  };

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function printed(): string {
    return consoleSpy.mock.calls.flat().join("\n");
  }

  it("prints a concise project handoff", () => {
    printSummary(baseState, false);

    expect(printed()).toContain("test-app is ready");
    expect(printed()).toContain("Express API (JWT only)");
    expect(printed()).toContain("SQLite with Prisma");
    expect(printed()).not.toContain("npm run docker:up");
    expect(printed()).toContain("npm run db:migrate");
    expect(printed()).toContain("npx create-authenik8-app@latest doctor");
    expect(printed()).toContain("First success");
    expect(printed()).toContain("Verify the JWT boundary");
    expect(printed()).toContain("trusted identity source");
    expect(printed()).toContain("authenik8.json");
    expect(printed()).not.toContain("github.com/COD434");
  });

  it("uses the selected package manager in next steps", () => {
    printSummary({ ...baseState, packageManager: "pnpm", installDeps: false }, false);

    expect(printed()).toContain("pnpm install");
    expect(printed()).toContain("pnpm dlx create-authenik8-app@latest doctor");
    expect(printed()).toContain("pnpm run dev");
  });

  it("summarizes password and selected OAuth authentication", () => {
    printSummary({
      ...baseState,
      authMode: "auth-oauth",
      oauthProviders: ["github"],
    }, false);

    expect(printed()).toContain("Email, password, and GitHub");
    expect(printed()).toContain("Complete an authenticated API request");
    expect(printed()).toContain("GET /protected");
    expect(printed()).toContain("Configure GitHub OAuth credentials");
    expect(printed()).not.toContain("Google OAuth credentials");
  });

  it("handles a fullstack project with no OAuth providers", () => {
    printSummary({
      ...baseState,
      authMode: "fullstack",
      database: "postgresql",
      oauthProviders: [],
    }, false);

    expect(printed()).toContain("Email and password");
    expect(printed()).toContain("npm run dev");
    expect(printed()).not.toContain("npm run setup");
    expect(printed()).not.toContain("npm run db:migrate");
    expect(printed()).not.toContain("npm run db:seed");
    expect(printed()).toContain("http://localhost:5173");
    expect(printed()).toContain("SEED_ADMIN_EMAIL");
    expect(printed()).toContain("Change the seeded password");
    expect(printed()).not.toContain("First run");
  });

  it("prints the concise Lovable handoff only for Lovable mode", () => {
    printSummary({
      ...baseState,
      authMode: "fullstack",
      database: "postgresql",
      frontend: "lovable",
    }, false);

    expect(printed()).toContain("Authenik8 with Lovable is ready.");
    expect(printed()).toContain("npm run dev:lovable");
    expect(printed()).toContain("ChatGPT with the Authenik8 MCP app and Lovable");
    expect(printed()).toContain("integrations/lovable/START_HERE.md");
    expect(printed()).toContain("API  http://localhost:3000/api");
    expect(printed()).not.toContain("Web  http://localhost:5173");
    expect(printed()).not.toContain("integrations/lovable/README.md");
    expect(printed()).not.toContain("npm run doctor:lovable");
  });

  it("omits Prisma commands for a database-free project", () => {
    printSummary({ ...baseState, usePrisma: false }, false);

    expect(printed()).toContain("Database");
    expect(printed()).toContain("None");
    expect(printed()).not.toContain("prisma:migrate");
  });

  it("shows the PM2 command for production API presets", () => {
    printSummary(baseState, true);
    expect(printed()).toContain("Production process");
    expect(printed()).toContain("npm run pm2:start");
  });

  it("warns instead of printing an unusable Docker command when Compose is unavailable", () => {
    printSummary({ ...baseState, database: "postgresql" }, false, false);

    expect(printed()).toContain("Docker Compose was not found");
    expect(printed()).toContain("provide PostgreSQL through DATABASE_URL");
    expect(printed()).not.toContain("npm run docker:up");
  });

  it("keeps fullstack startup available when Docker is unavailable", () => {
    printSummary({
      ...baseState,
      authMode: "fullstack",
      database: "postgresql",
    }, false, false);

    expect(printed()).not.toContain("Docker Compose was not found");
    expect(printed()).not.toContain("npm run setup");
    expect(printed()).not.toContain("npm run db:migrate");
    expect(printed()).toContain("npm run dev");
  });

  it("warns instead of printing an unusable Docker command when the daemon is stopped", () => {
    printSummary({ ...baseState, database: "postgresql" }, false, true, false);

    expect(printed()).toContain("daemon is not reachable");
    expect(printed()).toContain("Start Docker Desktop or the Docker service");
    expect(printed()).not.toContain("npm run docker:up");
  });

  it("prints the first-run admin credentials and CSRF-protected try-it curl", () => {
    printSummary({
      ...baseState,
      authMode: "fullstack",
      database: "postgresql",
      oauthProviders: [],
    }, false, true, true, { email: "admin@example.com", password: "dev-password-123" });

    expect(printed()).toContain("First run");
    expect(printed()).toContain("http://localhost:5173/login");
    expect(printed()).toContain("admin@example.com / dev-password-123");
    expect(printed()).toContain("Change SEED_ADMIN_PASSWORD");
    expect(printed()).toContain("curl -s -c .authenik8.cookies http://localhost:3000/api/auth/csrf");
    expect(printed()).toContain("X-CSRF-Token: <token-from-step-1>");
    expect(printed()).toContain('"email":"admin@example.com","password":"dev-password-123"');
    expect(printed()).not.toContain("three demo projects");
  });

  it("mentions the seeded demo data only when the demo flag is set", () => {
    printSummary({
      ...baseState,
      authMode: "fullstack",
      database: "postgresql",
      oauthProviders: [],
      demo: true,
    }, false, true, true, { email: "admin@example.com", password: "dev-password-123" });

    expect(printed()).toContain("three demo projects");
  });

  it("keeps the credential block out of non-fullstack summaries", () => {
    printSummary({ ...baseState, demo: true }, false, true, true, {
      email: "admin@example.com",
      password: "dev-password-123",
    });

    expect(printed()).not.toContain("First run");
    expect(printed()).not.toContain("dev-password-123");
  });
});

describe("readSeedAdminCredentials", () => {
  it("surfaces only the two dev seed keys from the generated .env", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-output-"));
    try {
      await fs.writeFile(
        path.join(dir, ".env"),
        [
          "SEED_ADMIN_EMAIL=admin@example.com",
          "SEED_ADMIN_PASSWORD=dev-password-123",
          "AUTHENIK8_SIGNING_JWKS=[{\"kid\":\"secret\"}]",
          "REDIS_URL=memory://",
        ].join("\n"),
      );

      expect(readSeedAdminCredentials(dir)).toStrictEqual({
        email: "admin@example.com",
        password: "dev-password-123",
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when the keys or the file are missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-output-"));
    try {
      expect(readSeedAdminCredentials(dir)).toBeUndefined();

      await fs.writeFile(path.join(dir, ".env"), "SEED_ADMIN_EMAIL=admin@example.com\n");
      expect(readSeedAdminCredentials(dir)).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});