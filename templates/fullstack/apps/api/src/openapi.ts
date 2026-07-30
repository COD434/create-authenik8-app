import {
  adminUserUpdateSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  oauthExchangeSchema,
  profileSchema,
  projectCreateSchema,
  projectUpdateSchema,
  registerSchema,
  resetPasswordSchema,
  verificationSchema,
} from "@authenik8/contracts";
import { z, type ZodType } from "zod";

type JsonSchema = Record<string, unknown>;

function inputSchema(schema: ZodType, required?: string[]): JsonSchema {
  const { $schema: _schema, ...document } = z.toJSONSchema(schema, { io: "output" }) as JsonSchema;
  if (required) document.required = required;
  return document;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: JsonSchema) => ({ "application/json": { schema } });
const jsonResponse = (description: string, schema?: JsonSchema) => ({
  description,
  ...(schema ? { content: jsonContent(schema) } : {}),
});
const requestBody = (name: string) => ({
  required: true,
  content: jsonContent(ref(name)),
});
const pageResponseSchema = (item: string) => ({
  type: "object",
  required: ["items", "total", "page", "pageSize"],
  properties: {
    items: { type: "array", items: ref(item) },
    total: { type: "integer", minimum: 0 },
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1 },
  },
});
const errorResponse = (description: string) => jsonResponse(description, ref("Error"));
const bearerSecurity = [{ bearerAuth: [] }];
const csrfSecurity = [{ csrfToken: [] }];
const refreshSecurity = [{ refreshCookie: [], csrfToken: [] }];
const protectedMutationSecurity = [{ bearerAuth: [], csrfToken: [] }];
const idParameter = {
  in: "path",
  name: "id",
  required: true,
  schema: { type: "string", format: "uuid" },
};
const providerParameter = {
  in: "path",
  name: "provider",
  required: true,
  schema: { type: "string", enum: ["google", "github"] },
};
const pageParameter = {
  in: "query",
  name: "page",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 10_000, default: 1 },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Authenik8 Full-stack API", version: "1.0.0" },
  servers: [{ url: "/api" }],
  security: [],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "authenik8_refresh" },
      csrfToken: { type: "apiKey", in: "header", name: "X-CSRF-Token" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              fields: {
                type: "object",
                additionalProperties: { type: "array", items: { type: "string" } },
              },
            },
          },
          requestId: { type: "string" },
        },
      },
      User: {
        type: "object",
        required: ["id", "email", "name", "role", "status", "verified", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: ["USER", "ADMIN"] },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
          verified: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Project: {
        type: "object",
        required: ["id", "name", "description", "status", "ownerId", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
          ownerId: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Session: {
        type: "object",
        required: ["id", "userAgent", "ipAddress", "createdAt", "lastUsedAt", "expiresAt", "current"],
        properties: {
          id: { type: "string", format: "uuid" },
          userAgent: { type: "string" },
          ipAddress: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          current: { type: "boolean" },
        },
      },
      LinkedProvider: {
        type: "object",
        required: ["provider", "providerEmail", "linkedAt"],
        properties: {
          provider: { type: "string", enum: ["google", "github"] },
          providerEmail: { type: "string", format: "email" },
          linkedAt: { type: "string", format: "date-time" },
        },
      },
      AuditEvent: {
        type: "object",
        required: ["id", "action", "actorEmail", "targetType", "targetId", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          action: { type: "string" },
          actorEmail: { type: ["string", "null"], format: "email" },
          targetType: { type: "string" },
          targetId: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      DeliveryMessage: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
          devVerificationToken: { type: "string" },
          devResetToken: { type: "string" },
        },
      },
      AuthResponse: {
        type: "object",
        required: ["accessToken", "user"],
        properties: {
          accessToken: { type: "string" },
          user: ref("User"),
        },
      },
      UserResponse: {
        type: "object",
        required: ["user"],
        properties: { user: ref("User") },
      },
      ProjectResponse: {
        type: "object",
        required: ["project"],
        properties: { project: ref("Project") },
      },
      ProjectList: {
        type: "object",
        required: ["projects"],
        properties: { projects: { type: "array", items: ref("Project") } },
      },
      SessionList: {
        type: "object",
        required: ["sessions"],
        properties: { sessions: { type: "array", items: ref("Session") } },
      },
      ProviderList: {
        type: "object",
        required: ["providers"],
        properties: { providers: { type: "array", items: ref("LinkedProvider") } },
      },
      AuditPage: pageResponseSchema("AuditEvent"),
      UserPage: pageResponseSchema("User"),
      LoginInput: inputSchema(loginSchema),
      RegisterInput: inputSchema(registerSchema),
      ForgotPasswordInput: inputSchema(forgotPasswordSchema),
      ResetPasswordInput: inputSchema(resetPasswordSchema),
      VerificationInput: inputSchema(verificationSchema),
      OAuthExchangeInput: inputSchema(oauthExchangeSchema),
      ProfileInput: inputSchema(profileSchema),
      ChangePasswordInput: inputSchema(changePasswordSchema),
      ProjectCreateInput: inputSchema(projectCreateSchema, ["name"]),
      ProjectUpdateInput: inputSchema(projectUpdateSchema),
      AdminUserUpdateInput: inputSchema(adminUserUpdateSchema),
    },
  },
  paths: {
    "/health/live": {
      get: {
        summary: "Confirm that the API process is running",
        responses: { "200": jsonResponse("Live", { type: "object", properties: { status: { const: "ok" } } }) },
      },
    },
    "/health/ready": {
      get: {
        summary: "Check PostgreSQL and Redis readiness",
        responses: {
          "200": jsonResponse("Ready", {
            type: "object",
            required: ["status", "database", "redis"],
            properties: {
              status: { const: "ready" },
              database: { const: "ok" },
              redis: { type: "string", enum: ["ok", "unavailable"] },
            },
          }),
          "500": errorResponse("A dependency is unavailable"),
        },
      },
    },
    "/docs/openapi.json": {
      get: { summary: "Return this OpenAPI document", responses: { "200": jsonResponse("OpenAPI 3.1 document") } },
    },
    "/auth/csrf": {
      get: {
        summary: "Issue a signed CSRF token",
        responses: {
          "200": jsonResponse("CSRF token and protected cookie", {
            type: "object",
            required: ["csrfToken"],
            properties: { csrfToken: { type: "string" } },
          }),
        },
      },
    },
    "/auth/register": {
      post: {
        summary: "Register with email and password",
        security: csrfSecurity,
        requestBody: requestBody("RegisterInput"),
        responses: {
          "201": jsonResponse("Verification requested", ref("DeliveryMessage")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Create a refresh session",
        security: csrfSecurity,
        requestBody: requestBody("LoginInput"),
        responses: {
          "200": jsonResponse("Authenticated session", ref("AuthResponse")),
          "401": errorResponse("Invalid credentials"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotate the refresh cookie",
        security: refreshSecurity,
        responses: {
          "200": jsonResponse("Rotated session", ref("AuthResponse")),
          "401": errorResponse("Replay or invalid session"),
          "409": errorResponse("Another refresh is already in progress"),
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Revoke the current refresh session",
        security: refreshSecurity,
        responses: { "200": jsonResponse("Signed out", ref("Message")) },
      },
    },
    "/auth/me": {
      get: {
        summary: "Return the authenticated user",
        security: bearerSecurity,
        responses: {
          "200": jsonResponse("Current user", ref("UserResponse")),
          "401": errorResponse("Authentication required"),
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        summary: "Request a password reset",
        security: csrfSecurity,
        requestBody: requestBody("ForgotPasswordInput"),
        responses: {
          "200": jsonResponse("Generic delivery response", ref("DeliveryMessage")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/auth/reset-password": {
      post: {
        summary: "Consume a reset token and update the password",
        security: csrfSecurity,
        requestBody: requestBody("ResetPasswordInput"),
        responses: {
          "200": jsonResponse("Password updated", ref("Message")),
          "400": errorResponse("Invalid or expired reset token"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/auth/verify-email": {
      post: {
        summary: "Consume an email verification token",
        security: csrfSecurity,
        requestBody: requestBody("VerificationInput"),
        responses: {
          "200": jsonResponse("Email verified", ref("Message")),
          "400": errorResponse("Invalid or expired verification token"),
        },
      },
    },
    "/auth/resend-verification": {
      post: {
        summary: "Send another verification message",
        security: protectedMutationSecurity,
        responses: {
          "200": jsonResponse("Verification sent", ref("DeliveryMessage")),
          "401": errorResponse("Authentication required"),
        },
      },
    },
    "/auth/oauth/{provider}": {
      parameters: [providerParameter],
      get: {
        summary: "Start OAuth sign-in",
        responses: {
          "302": { description: "Redirect to the provider" },
          "404": errorResponse("Provider is not configured"),
        },
      },
    },
    "/auth/oauth/{provider}/link-intent": {
      parameters: [providerParameter],
      post: {
        summary: "Create a short-lived account-link intent",
        security: protectedMutationSecurity,
        responses: {
          "200": jsonResponse("Link intent created", {
            type: "object",
            required: ["url"],
            properties: { url: { type: "string" } },
          }),
          "404": errorResponse("Provider is not configured"),
        },
      },
    },
    "/auth/oauth/{provider}/link": {
      parameters: [
        providerParameter,
        {
          in: "query",
          name: "ticket",
          required: true,
          schema: { type: "string", minLength: 32, maxLength: 256 },
        },
      ],
      get: {
        summary: "Consume a link intent and start provider authorization",
        responses: {
          "302": { description: "Redirect to the provider" },
          "400": errorResponse("Invalid or expired link intent"),
        },
      },
    },
    "/auth/oauth/{provider}/callback": {
      parameters: [providerParameter],
      get: {
        summary: "Complete the provider callback",
        responses: {
          "302": { description: "Redirect to the SPA callback or settings page" },
        },
      },
    },
    "/auth/oauth/exchange": {
      post: {
        summary: "Exchange a single-use OAuth code for a session",
        security: csrfSecurity,
        requestBody: requestBody("OAuthExchangeInput"),
        responses: {
          "200": jsonResponse("Authenticated session", ref("AuthResponse")),
          "400": errorResponse("Invalid or expired exchange code"),
        },
      },
    },
    "/account/profile": {
      patch: {
        summary: "Update the current profile",
        security: protectedMutationSecurity,
        requestBody: requestBody("ProfileInput"),
        responses: {
          "200": jsonResponse("Updated profile", ref("UserResponse")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/account/password": {
      put: {
        summary: "Change the password and revoke every session",
        security: protectedMutationSecurity,
        requestBody: requestBody("ChangePasswordInput"),
        responses: {
          "200": jsonResponse("Password updated", ref("Message")),
          "400": errorResponse("Current password is incorrect"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/account/sessions": {
      get: {
        summary: "List active sessions",
        security: bearerSecurity,
        responses: { "200": jsonResponse("Active sessions", ref("SessionList")) },
      },
    },
    "/account/sessions/{id}": {
      parameters: [idParameter],
      delete: {
        summary: "Revoke one owned session",
        security: protectedMutationSecurity,
        responses: {
          "200": jsonResponse("Session revoked", ref("Message")),
          "404": errorResponse("Session not found"),
        },
      },
    },
    "/account/providers": {
      get: {
        summary: "List linked OAuth providers",
        security: bearerSecurity,
        responses: { "200": jsonResponse("Linked providers", ref("ProviderList")) },
      },
    },
    "/projects": {
      get: {
        summary: "List authorized projects",
        security: bearerSecurity,
        responses: { "200": jsonResponse("Project list", ref("ProjectList")) },
      },
      post: {
        summary: "Create an owned project",
        security: protectedMutationSecurity,
        requestBody: requestBody("ProjectCreateInput"),
        responses: {
          "201": jsonResponse("Project created", ref("ProjectResponse")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/projects/{id}": {
      parameters: [idParameter],
      get: {
        summary: "Read an authorized project",
        security: bearerSecurity,
        responses: {
          "200": jsonResponse("Project", ref("ProjectResponse")),
          "404": errorResponse("Not found or not authorized"),
        },
      },
      patch: {
        summary: "Update an authorized project",
        security: protectedMutationSecurity,
        requestBody: requestBody("ProjectUpdateInput"),
        responses: {
          "200": jsonResponse("Project updated", ref("ProjectResponse")),
          "404": errorResponse("Not found or not authorized"),
          "422": errorResponse("Validation error"),
        },
      },
      delete: {
        summary: "Delete an authorized project",
        security: protectedMutationSecurity,
        responses: {
          "204": { description: "Project deleted" },
          "404": errorResponse("Not found or not authorized"),
        },
      },
    },
    "/admin/users": {
      get: {
        summary: "List users",
        security: bearerSecurity,
        parameters: [pageParameter],
        responses: {
          "200": jsonResponse("Paginated users", ref("UserPage")),
          "403": errorResponse("Administrator required"),
        },
      },
    },
    "/admin/users/{id}": {
      parameters: [idParameter],
      patch: {
        summary: "Update a user role or status",
        security: protectedMutationSecurity,
        requestBody: requestBody("AdminUserUpdateInput"),
        responses: {
          "200": jsonResponse("Updated user", ref("UserResponse")),
          "400": errorResponse("Self-lockout rejected"),
          "403": errorResponse("Administrator required"),
        },
      },
    },
    "/admin/users/{id}/sessions": {
      parameters: [idParameter],
      delete: {
        summary: "Revoke every session for a user",
        security: protectedMutationSecurity,
        responses: {
          "200": jsonResponse("Sessions revoked", ref("Message")),
          "403": errorResponse("Administrator required"),
        },
      },
    },
    "/admin/audit": {
      get: {
        summary: "List recent administrator audit events",
        security: bearerSecurity,
        parameters: [pageParameter],
        responses: {
          "200": jsonResponse("Paginated audit events", ref("AuditPage")),
          "403": errorResponse("Administrator required"),
        },
      },
    },
  },
} as const;
