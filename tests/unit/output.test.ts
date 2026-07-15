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
    expect(printed()).toContain("npm run docker:up");
    expect(printed()).toContain("npm run prisma:migrate");
    expect(printed()).not.toContain("github.com/COD434");
  });

  it("uses the selected package manager in next steps", () => {
    printSummary({ ...baseState, packageManager: "pnpm", installDeps: false }, false);

    expect(printed()).toContain("pnpm install");
    expect(printed()).toContain("pnpm run dev");
  });

  it("summarizes password and selected OAuth authentication", () => {
    printSummary({
      ...baseState,
      authMode: "auth-oauth",
      oauthProviders: ["github"],
    }, false);

    expect(printed()).toContain("Email, password, and GitHub");
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
    expect(printed()).toContain("npm run db:migrate");
    expect(printed()).toContain("npm run db:seed");
    expect(printed()).toContain("http://localhost:5173");
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
    printSummary(baseState, false, false);

    expect(printed()).toContain("Docker Compose was not found");
    expect(printed()).toContain("start Redis manually");
    expect(printed()).not.toContain("npm run docker:up");
  });

  it("warns instead of printing an unusable Docker command when the daemon is stopped", () => {
    printSummary(baseState, false, true, false);

    expect(printed()).toContain("daemon is not reachable");
    expect(printed()).toContain("Start Docker Desktop or the Docker service");
    expect(printed()).not.toContain("npm run docker:up");
  });
});
