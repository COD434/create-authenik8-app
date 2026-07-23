import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliState } from "../../src/lib/types.js";
import { printSummary } from "../../src/utils/output.js";

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
<<<<<<< HEAD
    expect(printed()).not.toContain("npm run docker:up");
    expect(printed()).toContain("npm run db:migrate");
    expect(printed()).toContain("npx create-authenik8-app@latest doctor");
    expect(printed()).toContain("First success");
    expect(printed()).toContain("Verify the JWT boundary");
    expect(printed()).toContain("trusted identity source");
    expect(printed()).toContain("authenik8.json");
=======
    expect(printed()).toContain("npm run docker:up");
    expect(printed()).toContain("npm run prisma:migrate");
>>>>>>> main
    expect(printed()).not.toContain("github.com/COD434");
  });

  it("uses the selected package manager in next steps", () => {
    printSummary({ ...baseState, packageManager: "pnpm", installDeps: false }, false);

    expect(printed()).toContain("pnpm install");
<<<<<<< HEAD
    expect(printed()).toContain("pnpm dlx create-authenik8-app@latest doctor");
=======
>>>>>>> main
    expect(printed()).toContain("pnpm run dev");
  });

  it("summarizes password and selected OAuth authentication", () => {
    printSummary({
      ...baseState,
      authMode: "auth-oauth",
      oauthProviders: ["github"],
    }, false);

    expect(printed()).toContain("Email, password, and GitHub");
<<<<<<< HEAD
    expect(printed()).toContain("Complete an authenticated API request");
    expect(printed()).toContain("GET /protected");
=======
>>>>>>> main
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
<<<<<<< HEAD
    expect(printed()).toContain("npm run dev");
    expect(printed()).not.toContain("npm run setup");
    expect(printed()).not.toContain("npm run db:migrate");
    expect(printed()).not.toContain("npm run db:seed");
    expect(printed()).toContain("http://localhost:5173");
    expect(printed()).toContain("SEED_ADMIN_EMAIL");
    expect(printed()).toContain("Change the seeded password");
=======
    expect(printed()).toContain("npm run db:migrate");
    expect(printed()).toContain("npm run db:seed");
    expect(printed()).toContain("http://localhost:5173");
>>>>>>> main
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
<<<<<<< HEAD
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

=======
    printSummary(baseState, false, false);

    expect(printed()).toContain("Docker Compose was not found");
    expect(printed()).toContain("start Redis manually");
    expect(printed()).not.toContain("npm run docker:up");
  });

  it("warns instead of printing an unusable Docker command when the daemon is stopped", () => {
    printSummary(baseState, false, true, false);

>>>>>>> main
    expect(printed()).toContain("daemon is not reachable");
    expect(printed()).toContain("Start Docker Desktop or the Docker service");
    expect(printed()).not.toContain("npm run docker:up");
  });
});
