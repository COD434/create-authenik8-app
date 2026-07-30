<<<<<<< HEAD
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validate } from "@readme/openapi-parser";
=======
>>>>>>> 69568dd (feat:fixed merge conflict)
import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.js";

const documentedPaths = [
<<<<<<< HEAD
  "/.well-known/jwks.json",
  "/api/health/live",
  "/api/health/ready",
  "/api/docs/openapi.json",
  "/api/auth/csrf",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/oauth/{provider}",
  "/api/auth/oauth/{provider}/link-intent",
  "/api/auth/oauth/{provider}/link",
  "/api/auth/oauth/{provider}/callback",
  "/api/auth/oauth/exchange",
  "/api/account/profile",
  "/api/account/password",
  "/api/account/sessions",
  "/api/account/sessions/{id}",
  "/api/account/providers",
  "/api/account/providers/{provider}",
  "/api/projects",
  "/api/projects/{id}",
  "/api/admin/users",
  "/api/admin/users/{id}",
  "/api/admin/users/{id}/sessions",
  "/api/admin/audit",
].sort();

describe("OpenAPI contract", () => {
  it("is valid OpenAPI 3.1 and matches every committed static artifact", async () => {
    const artifactPath = path.resolve(import.meta.dirname, "../openapi.json");
    const artifact = await readFile(artifactPath, "utf8");
    const result = await validate(JSON.parse(artifact));

    expect(result.valid).toBe(true);
    expect(JSON.parse(artifact)).toEqual(openApiDocument);

    const lovableArtifactPath = path.resolve(
      import.meta.dirname,
      "../../../integrations/lovable/openapi.json",
    );
    if (existsSync(lovableArtifactPath)) {
      expect(await readFile(lovableArtifactPath, "utf8")).toBe(artifact);
    }
  });

=======
  "/health/live",
  "/health/ready",
  "/docs/openapi.json",
  "/auth/csrf",
  "/auth/register",
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/me",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/oauth/{provider}",
  "/auth/oauth/{provider}/link-intent",
  "/auth/oauth/{provider}/link",
  "/auth/oauth/{provider}/callback",
  "/auth/oauth/exchange",
  "/account/profile",
  "/account/password",
  "/account/sessions",
  "/account/sessions/{id}",
  "/account/providers",
  "/projects",
  "/projects/{id}",
  "/admin/users",
  "/admin/users/{id}",
  "/admin/users/{id}/sessions",
  "/admin/audit",
].sort();

describe("OpenAPI contract", () => {
>>>>>>> 69568dd (feat:fixed merge conflict)
  it("documents every mounted API operation", () => {
    expect(Object.keys(openApiDocument.paths).sort()).toEqual(documentedPaths);
  });

  it("declares shared path parameters for every templated path", () => {
    for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (!names.length) continue;
      expect(pathItem).toHaveProperty("parameters");
      expect(pathItem.parameters.map((parameter) => parameter.name)).toEqual(expect.arrayContaining(names));
    }
  });

  it("derives request contracts and attaches mutation request bodies", () => {
    expect(openApiDocument.components.schemas.RegisterInput).toMatchObject({
      type: "object",
      required: ["name", "email", "password"],
      additionalProperties: false,
    });
    expect(openApiDocument.components.schemas.ProjectCreateInput).toMatchObject({
      required: ["name"],
      additionalProperties: false,
    });
<<<<<<< HEAD
    expect(openApiDocument.paths["/api/projects/{id}"].patch.requestBody)
      .toMatchObject({ required: true });
    expect(openApiDocument.paths["/api/admin/users/{id}"].patch.requestBody)
=======
    expect(openApiDocument.paths["/projects/{id}"].patch.requestBody)
      .toMatchObject({ required: true });
    expect(openApiDocument.paths["/admin/users/{id}"].patch.requestBody)
>>>>>>> 69568dd (feat:fixed merge conflict)
      .toMatchObject({ required: true });
  });

  it("documents pagination for both admin collections", () => {
<<<<<<< HEAD
    expect(openApiDocument.paths["/api/admin/users"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.paths["/api/admin/audit"].get.parameters).toContainEqual(
=======
    expect(openApiDocument.paths["/admin/users"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.paths["/admin/audit"].get.parameters).toContainEqual(
>>>>>>> 69568dd (feat:fixed merge conflict)
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.components.schemas.AuditPage).toMatchObject({
      required: ["items", "total", "page", "pageSize"],
    });
  });
<<<<<<< HEAD

  it("marks cookie, active-session, and administrator requirements explicitly", () => {
    expect(openApiDocument.paths["/api/auth/refresh"].post).toMatchObject({
      security: [{ refreshCookie: [], csrfCookie: [], csrfToken: [] }],
      "x-authenik8-credentials": "include",
    });
    expect(openApiDocument.paths["/api/admin/users"].get).toMatchObject({
      tags: ["Administration"],
      "x-authenik8-requires-active-session": true,
      "x-authenik8-requires-admin": true,
    });
  });

  it("never emits private JWK members or environment secrets", () => {
    const serialized = JSON.stringify(openApiDocument);
    expect(serialized).not.toMatch(/"(?:d|p|q|dp|dq|qi|oth|k)"\s*:/);
    expect(serialized).not.toContain("REFRESH_SECRET");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("PRIVATE KEY");
  });
=======
>>>>>>> 69568dd (feat:fixed merge conflict)
});
