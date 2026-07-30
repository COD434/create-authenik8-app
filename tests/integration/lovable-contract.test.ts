import fs from "fs-extra";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateProjectFixture, type GeneratedProject } from "../helpers/generator.js";

const requiredPaths = [
  "/.well-known/jwks.json",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/account/sessions",
  "/api/account/sessions/{id}",
  "/api/account/providers/{provider}",
  "/api/admin/users",
  "/api/admin/users/{id}",
  "/api/admin/users/{id}/sessions",
  "/api/admin/audit",
];

describe("generated Lovable integration contract", () => {
  let generated: GeneratedProject | undefined;

  afterEach(async () => {
    await generated?.cleanup();
    generated = undefined;
  });

  it("ships deterministic frontend and security contracts with the full-stack preset", async () => {
    generated = await generateProjectFixture({ template: "fullstack", frontend: "lovable" });
    const integrationDirectory = path.join(generated.targetDir, "integrations/lovable");
    const frontendContract = await fs.readFile(path.join(integrationDirectory, "FRONTEND_CONTRACT.md"), "utf8");
    const securityRules = await fs.readFile(path.join(integrationDirectory, "SECURITY_RULES.md"), "utf8");
    const prompt = await fs.readFile(path.join(integrationDirectory, "LOVABLE_PROMPT.md"), "utf8");
    const readme = await fs.readFile(path.join(integrationDirectory, "README.md"), "utf8");
    const environment = await fs.readFile(path.join(integrationDirectory, "env.example"), "utf8");
    const checklist = await fs.readFile(path.join(integrationDirectory, "acceptance-checklist.md"), "utf8");
    const artifact = await fs.readJson(path.join(integrationDirectory, "openapi.json"));
    const pkg = await fs.readJson(path.join(generated.targetDir, "package.json"));

    expect(artifact.openapi).toBe("3.1.0");
    expect(Object.keys(artifact.paths)).toEqual(expect.arrayContaining(requiredPaths));
    expect(artifact.paths["/api/auth/refresh"].post.security).toEqual([
      { refreshCookie: [], csrfCookie: [], csrfToken: [] },
    ]);
    expect(artifact.paths["/api/admin/users"].get).toMatchObject({
      "x-authenik8-requires-active-session": true,
      "x-authenik8-requires-admin": true,
    });
    expect(frontendContract).toContain("@authenik8/api-client");
    expect(frontendContract).toContain("GET /api/auth/me");
    expect(securityRules).toContain("Do not enable Lovable Cloud authentication or Supabase authentication");
    expect(securityRules).toContain("Never put a secret in a `VITE_*` variable");
    expect(prompt).toContain("Step 7 — acceptance and confirmed fixes");
    expect(prompt).toContain("Do not enable Lovable");
    expect(readme).toContain("Vibe-code the interface");
    expect(environment).toContain("VITE_AUTHENIK8_API_URL=https://api.example.com");
    expect(checklist).toContain("ordinary user calling an admin API receives `403`");
    expect(pkg.scripts["doctor:lovable"]).toBe("node scripts/doctor-lovable.mjs");
    expect(pkg.scripts["export:lovable-client"]).toContain("export-lovable-client.mjs");
    expect(await fs.pathExists(path.join(generated.targetDir, "scripts/doctor-lovable.mjs"))).toBe(true);
    expect(await fs.pathExists(path.join(
      generated.targetDir,
      "scripts/export-lovable-client.mjs",
    ))).toBe(true);
  });

  it("does not expose private JWK members or backend secrets", async () => {
    generated = await generateProjectFixture({ template: "fullstack", frontend: "lovable" });
    const integrationDirectory = path.join(generated.targetDir, "integrations/lovable");
    const artifact = await fs.readFile(path.join(integrationDirectory, "openapi.json"), "utf8");
    const securityRules = await fs.readFile(path.join(integrationDirectory, "SECURITY_RULES.md"), "utf8");

    expect(artifact).not.toMatch(/"(?:d|p|q|dp|dq|qi|oth|k)"\s*:/);
    expect(artifact).not.toContain("REFRESH_SECRET");
    expect(artifact).not.toContain("DATABASE_URL");
    expect(securityRules).not.toMatch(/-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/);
  });

  it("keeps the complete Lovable workflow opt-in while retaining the base contract", async () => {
    generated = await generateProjectFixture({ template: "fullstack", frontend: "react" });
    const pkg = await fs.readJson(path.join(generated.targetDir, "package.json"));

    expect(pkg.scripts["doctor:lovable"]).toBeUndefined();
    expect(await fs.pathExists(path.join(
      generated.targetDir,
      "integrations/lovable/LOVABLE_PROMPT.md",
    ))).toBe(false);
    expect(await fs.pathExists(path.join(
      generated.targetDir,
      "integrations/lovable/openapi.json",
    ))).toBe(true);
  });
});
