import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.js";

const documentedPaths = [
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
    expect(openApiDocument.paths["/projects/{id}"].patch.requestBody)
      .toMatchObject({ required: true });
    expect(openApiDocument.paths["/admin/users/{id}"].patch.requestBody)
      .toMatchObject({ required: true });
  });

  it("documents pagination for both admin collections", () => {
    expect(openApiDocument.paths["/admin/users"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.paths["/admin/audit"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.components.schemas.AuditPage).toMatchObject({
      required: ["items", "total", "page", "pageSize"],
    });
  });
});
