import { describe, expect, it } from "vitest";

import { SPEC_SUPPORTED, projectSpecSchema, validateSpec } from "../src/spec.js";

const BASE_OK = {
  projectName: "my-app",
  preset: "base",
  usePrisma: false,
} as const;

describe("spec snapshot", () => {
  it("matches the mirrored CLI enums at the recorded snapshot", () => {
    expect(SPEC_SUPPORTED).toEqual({
      framework: ["Express"],
      presets: ["base", "auth", "auth-oauth", "fullstack"],
      frontends: ["react", "lovable", "next"],
      databases: ["sqlite", "postgresql"],
      runtimes: ["node", "bun"],
      oauthProviders: ["google", "github"],
      authMethods: ["password", "google", "github"],
      packageManagers: ["npm", "pnpm", "bun"],
    });
  });

  it("rejects unknown fields and malformed project names", () => {
    expect(projectSpecSchema.safeParse({ ...BASE_OK, surprise: 1 }).success).toBe(false);
    expect(projectSpecSchema.safeParse({ ...BASE_OK, projectName: "Not Valid!" }).success).toBe(false);
    expect(projectSpecSchema.safeParse({ ...BASE_OK, preset: "express-only" }).success).toBe(false);
  });
});

describe("spec validation rules (mirrored from the CLI)", () => {
  it("accepts a minimal base project without Prisma", () => {
    const result = validateSpec(BASE_OK);
    expect(result.valid).toBe(true);
  });

  it("requires an explicit Prisma decision for the base preset", () => {
    const result = validateSpec({ projectName: "my-app", preset: "base" });
    expect(result).toMatchObject({
      valid: false,
      issues: [{ path: "usePrisma", message: expect.stringContaining("Choose whether to add Prisma") }],
    });
  });

  it("requires a database when the base preset enables Prisma", () => {
    const result = validateSpec({ projectName: "my-app", preset: "base", usePrisma: true });
    expect(result).toMatchObject({
      valid: false,
      issues: [{ path: "database", message: "Select a database" }],
    });
    expect(validateSpec({ projectName: "my-app", preset: "base", usePrisma: true, database: "sqlite" }).valid).toBe(true);
  });

  it("requires a database for the auth preset", () => {
    const result = validateSpec({ projectName: "my-app", preset: "auth" });
    expect(result).toMatchObject({ valid: false, issues: [{ path: "database" }] });
  });

  it("requires at least one OAuth provider for auth-oauth", () => {
    const result = validateSpec({ projectName: "my-app", preset: "auth-oauth" });
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected invalid");
    expect(result.issues[0]).toMatchObject({
      path: "oauthProviders",
      message: expect.stringContaining("Select at least one OAuth provider"),
    });
    expect(
      validateSpec({
        projectName: "my-app",
        preset: "auth-oauth",
        oauthProviders: ["google"],
        database: "postgresql",
      }).valid,
    ).toBe(true);
  });

  it("requires password auth for the fullstack preset", () => {
    const result = validateSpec({ projectName: "my-app", preset: "fullstack", authMethods: ["google"] });
    expect(result).toMatchObject({
      valid: false,
      issues: [{ path: "authMethods", message: expect.stringContaining("Email and password is required") }],
    });
  });

  it("rejects non-PostgreSQL and non-Node choices for the fullstack preset", () => {
    const base = { projectName: "my-app", preset: "fullstack", authMethods: ["password", "google"] } as const;
    expect(validateSpec({ ...base, database: "sqlite" }).issues[0]).toMatchObject({ path: "database" });
    expect(validateSpec({ ...base, runtime: "bun" }).issues[0]).toMatchObject({ path: "runtime" });
  });

  it("normalizes the fullstack preset like the CLI transform", () => {
    const result = validateSpec({
      projectName: "my-app",
      preset: "fullstack",
      authMethods: ["password", "google", "github"],
    });
    if (!result.valid) throw new Error("expected valid");
    expect(result.normalized).toMatchObject({
      frontend: "react",
      usePrisma: true,
      database: "postgresql",
      runtime: "node",
      oauthProviders: ["google", "github"],
    });
  });

  it("keeps non-fullstack specs as-is (no default injection)", () => {
    const result = validateSpec(BASE_OK);
    if (!result.valid) throw new Error("expected valid");
    expect(result.normalized.frontend).toBeUndefined();
    expect(result.normalized.usePrisma).toBe(false);
    expect(result.normalized.database).toBeUndefined();
    expect("oauthProviders" in result.normalized).toBe(false);
  });
});
