
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validate } from "@readme/openapi-parser";

import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.js";
import { projectPolicyReadSummary, projectPolicyWriteSummary } from "../src/modules/projects/project.policy.js";
import { webhookPolicyReadSummary, webhookPolicyWriteSummary } from "../src/modules/webhooks/webhook.policy.js";

const documentedPaths = [

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
  "/api/webhooks",
  "/api/webhooks/{id}",
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

    expect(openApiDocument.paths["/api/projects/{id}"].patch.requestBody)
      .toMatchObject({ required: true });
    expect(openApiDocument.paths["/api/admin/users/{id}"].patch.requestBody)

      .toMatchObject({ required: true });
  });

  it("documents pagination for both admin collections", () => {

    expect(openApiDocument.paths["/api/admin/users"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.paths["/api/admin/audit"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "page", in: "query" }),
    );
    expect(openApiDocument.components.schemas.AuditPage).toMatchObject({
      required: ["items", "total", "page", "pageSize"],
    });
  });


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

  it("documents the compiled resource policy on project operations, matching the enforced rules", () => {
    // The rule strings come from the policy declaration via describeRule —
    // if the OpenAPI metadata drifts from the enforced rules, this fails.
    expect(openApiDocument.paths["/api/projects"].get).toMatchObject({
      "x-authenik8-policy": {
        resource: "Project",
        mode: "list",
        rule: projectPolicyReadSummary,
        "list-scope": "compiled from the read rule",
      },
    });
    expect(openApiDocument.paths["/api/projects/{id}"].get).toMatchObject({
      "x-authenik8-policy": {
        resource: "Project",
        mode: "read",
        rule: projectPolicyReadSummary,
        "denial-visibility": "masked-404",
      },
    });
    expect(openApiDocument.paths["/api/projects/{id}"].patch).toMatchObject({
      "x-authenik8-policy": {
        resource: "Project",
        mode: "write",
        rule: projectPolicyWriteSummary,
        "denial-visibility": "masked-404",
      },
    });
    expect(openApiDocument.paths["/api/projects/{id}"].delete).toMatchObject({
      "x-authenik8-policy": {
        resource: "Project",
        mode: "write",
        rule: projectPolicyWriteSummary,
        "denial-visibility": "masked-404",
      },
    });
    // createProject assigns ownership at creation; it declares no policy.
    expect(openApiDocument.paths["/api/projects"].post).not.toHaveProperty("x-authenik8-policy");
  });

  it("documents the compiled resource policy on webhook operations, matching the enforced rules", () => {
    expect(openApiDocument.paths["/api/webhooks"].get).toMatchObject({
      "x-authenik8-policy": {
        resource: "Webhook",
        mode: "list",
        rule: webhookPolicyReadSummary,
        "list-scope": "compiled from the read rule",
      },
    });
    expect(openApiDocument.paths["/api/webhooks/{id}"].get).toMatchObject({
      "x-authenik8-policy": {
        resource: "Webhook",
        mode: "read",
        rule: webhookPolicyReadSummary,
        "denial-visibility": "masked-404",
      },
    });
    expect(openApiDocument.paths["/api/webhooks/{id}"].patch).toMatchObject({
      "x-authenik8-policy": {
        resource: "Webhook",
        mode: "write",
        rule: webhookPolicyWriteSummary,
        "denial-visibility": "masked-404",
      },
    });
    expect(openApiDocument.paths["/api/webhooks/{id}"].delete).toMatchObject({
      "x-authenik8-policy": {
        resource: "Webhook",
        mode: "write",
        rule: webhookPolicyWriteSummary,
        "denial-visibility": "masked-404",
      },
    });
    // createWebhook assigns ownership at creation and returns the one-time
    // signing secret; it declares no policy metadata.
    expect(openApiDocument.paths["/api/webhooks"].post).not.toHaveProperty("x-authenik8-policy");
  });

  it("documents the one-time signing secret boundary in webhook operations", () => {
    const create = openApiDocument.paths["/api/webhooks"].post;
    expect(create.operationId).toBe("createWebhook");
    expect(create.description).toContain("returns it exactly once");
    // The 201 response references the created-response schema, whose
    // required list carries signingSecret; reads never carry the secret
    // because the Webhook response model does not include it at all.
    expect(JSON.stringify(create.responses["201"])).toContain("signing secret");
    expect(openApiDocument.components.schemas.WebhookCreatedResponse.required).toContain("signingSecret");
    expect(openApiDocument.components.schemas.Webhook.required).not.toContain("secret");
    expect(openApiDocument.components.schemas.Webhook.properties).not.toHaveProperty("signingSecret");
  });

  it("never emits private JWK members or environment secrets", () => {
    const serialized = JSON.stringify(openApiDocument);
    expect(serialized).not.toMatch(/"(?:d|p|q|dp|dq|qi|oth|k)"\s*:/);
    expect(serialized).not.toContain("REFRESH_SECRET");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("PRIVATE KEY");
  });

});
