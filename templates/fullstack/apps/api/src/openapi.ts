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

function inputSchemaWithExample(
  schema: ZodType,
  example: Record<string, unknown>,
  required?: string[],
): JsonSchema {
  return { ...inputSchema(schema, required), example };
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name: string) => ({ $ref: `#/components/responses/${name}` });
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
const commonErrors = {
  "403": responseRef("RequestRejected"),
  "429": responseRef("RateLimited"),
  "500": responseRef("InternalError"),
};
const browserMutationErrors = {
  ...commonErrors,
  "403": responseRef("RequestRejected"),
};
const authenticatedErrors = {
  ...commonErrors,
  "401": responseRef("Unauthenticated"),
};
const protectedMutationErrors = {
  ...authenticatedErrors,
  "403": responseRef("RequestRejected"),
};
const administratorErrors = {
  ...authenticatedErrors,
  "403": responseRef("AdministratorRequired"),
};
const bearerSecurity = [{ bearerAuth: [] }];
const csrfSecurity = [{ csrfCookie: [], csrfToken: [] }];
const refreshSecurity = [{ refreshCookie: [], csrfCookie: [], csrfToken: [] }];
const protectedMutationSecurity = [{ bearerAuth: [], csrfCookie: [], csrfToken: [] }];
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
  info: {
    title: "Authenik8 Full-stack API",
    version: "1.0.0",
    description: [
      "The public browser-facing contract for an Authenik8 full-stack application.",
      "Authenik8 owns identity, refresh rotation, session revocation, roles, and backend authorization.",
      "Browser clients keep access tokens in memory, send the HttpOnly refresh cookie with credentials,",
      "and obtain a CSRF token before mutations. Frontend route guards are not an authorization boundary.",
    ].join(" "),
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  servers: [
    { url: "http://localhost:3000", description: "Local API" },
    { url: "https://api.example.com", description: "Production API example; replace with your exact HTTPS origin" },
  ],
  tags: [
    { name: "Operational", description: "Health, readiness, API contract, and public verification keys." },
    { name: "Authentication", description: "Registration, session creation and rotation, recovery, verification, and OAuth." },
    { name: "Account", description: "Authenticated profile, password, provider, and session operations." },
    { name: "Projects", description: "Example application resource. Every operation is authorized on the backend." },
    { name: "Administration", description: "Administrator-only operations enforced by API middleware." },
  ],
  "x-authenik8-email-verification-policy": "Registration supports verification, but application routes do not currently require a verified email.",
  security: [],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Short-lived access token. Keep it in memory; never persist it in browser storage.",
      },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "authenik8_refresh",
        description: "HttpOnly refresh-session cookie. Browser JavaScript cannot and must not read it.",
      },
      csrfCookie: {
        type: "apiKey",
        in: "cookie",
        name: "authenik8_csrf",
        description: "Signed CSRF cookie issued by GET /api/auth/csrf.",
      },
      csrfToken: {
        type: "apiKey",
        in: "header",
        name: "X-CSRF-Token",
        description: "Echo the token returned by GET /api/auth/csrf. Send credentialed requests.",
      },
    },
    responses: {
      Unauthenticated: errorResponse("Authentication or an active session is required"),
      RequestRejected: errorResponse("The exact Origin or signed CSRF token was rejected"),
      AdministratorRequired: errorResponse("An active administrator session is required"),
      RateLimited: errorResponse("Too many requests"),
      InternalError: errorResponse("The request could not be completed"),
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        example: {
          error: { code: "UNAUTHENTICATED", message: "Authentication required" },
          requestId: "req_01JABCDEF123456789",
        },
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
        example: {
          id: "760e21f4-48f0-4d0a-9af5-292ef6ac7e55",
          email: "alex@example.com",
          name: "Alex Morgan",
          role: "USER",
          status: "ACTIVE",
          verified: true,
          createdAt: "2026-07-29T08:30:00.000Z",
        },
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
        example: {
          id: "0cbb641e-37e7-4452-a907-b5664e41fc79",
          name: "Launch checklist",
          description: "Tasks for the first release",
          status: "ACTIVE",
          ownerId: "760e21f4-48f0-4d0a-9af5-292ef6ac7e55",
          createdAt: "2026-07-29T09:00:00.000Z",
          updatedAt: "2026-07-29T09:15:00.000Z",
        },
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
        example: {
          id: "27fc9d69-d1df-4d80-851d-216963ad71ec",
          userAgent: "Mozilla/5.0",
          ipAddress: "203.0.113.10",
          createdAt: "2026-07-29T08:30:00.000Z",
          lastUsedAt: "2026-07-29T09:30:00.000Z",
          expiresAt: "2026-08-05T08:30:00.000Z",
          current: true,
        },
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
        description: "The access token is short-lived and must remain in memory. The refresh token is set only as an HttpOnly cookie.",
        properties: {
          accessToken: { type: "string", example: "eyJhbGciOiJFUzI1NiIsImtpZCI6ImV4YW1wbGUifQ..." },
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
      LoginInput: inputSchemaWithExample(loginSchema, {
        email: "alex@example.com",
        password: "CorrectHorse9",
      }),
      RegisterInput: inputSchemaWithExample(registerSchema, {
        name: "Alex Morgan",
        email: "alex@example.com",
        password: "CorrectHorse9",
      }),
      ForgotPasswordInput: inputSchemaWithExample(forgotPasswordSchema, {
        email: "alex@example.com",
      }),
      ResetPasswordInput: inputSchemaWithExample(resetPasswordSchema, {
        token: "example-reset-token-32-characters-long",
        password: "NewCorrectHorse9",
      }),
      VerificationInput: inputSchemaWithExample(verificationSchema, {
        token: "example-verification-token-32-chars",
      }),
      OAuthExchangeInput: inputSchemaWithExample(oauthExchangeSchema, {
        code: "example-single-use-oauth-code-32chars",
      }),
      ProfileInput: inputSchemaWithExample(profileSchema, {
        name: "Alex Morgan",
      }),
      ChangePasswordInput: inputSchemaWithExample(changePasswordSchema, {
        currentPassword: "CorrectHorse9",
        newPassword: "NewCorrectHorse9",
      }),
      ProjectCreateInput: inputSchemaWithExample(projectCreateSchema, {
        name: "Launch checklist",
        description: "Tasks for the first release",
        status: "ACTIVE",
      }, ["name"]),
      ProjectUpdateInput: inputSchemaWithExample(projectUpdateSchema, {
        status: "ARCHIVED",
      }),
      AdminUserUpdateInput: inputSchemaWithExample(adminUserUpdateSchema, {
        role: "ADMIN",
        status: "ACTIVE",
      }),
    },
  },
  paths: {
    "/api/health/live": {
      get: {
        operationId: "getLiveness",
        tags: ["Operational"],
        summary: "Confirm that the API process is running",
        responses: {
          ...commonErrors,
          "200": jsonResponse("Live", { type: "object", properties: { status: { const: "ok" } } }),
        },
      },
    },
    "/api/health/ready": {
      get: {
        operationId: "getReadiness",
        tags: ["Operational"],
        summary: "Check PostgreSQL and Redis readiness",
        responses: {
          ...commonErrors,
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
    "/.well-known/jwks.json": {
      get: {
        operationId: "getPublicJwks",
        tags: ["Operational"],
        summary: "Return public access-token verification keys",
        description: "Contains public JWK members only. Private key material is never returned.",
        responses: {
          ...commonErrors,
          "200": jsonResponse("Public JSON Web Key Set", {
            type: "object",
            required: ["keys"],
            properties: {
              keys: {
                type: "array",
                items: {
                  type: "object",
                  required: ["kty", "crv", "alg", "kid", "use", "key_ops", "x", "y"],
                  properties: {
                    kty: { const: "EC" },
                    crv: { const: "P-256" },
                    alg: { const: "ES256" },
                    kid: { type: "string" },
                    use: { const: "sig" },
                    key_ops: {
                      type: "array",
                      prefixItems: [{ const: "verify" }],
                      minItems: 1,
                      maxItems: 1,
                    },
                    x: { type: "string" },
                    y: { type: "string" },
                  },
                  additionalProperties: false,
                },
              },
            },
          }),
        },
      },
    },
    "/api/docs/openapi.json": {
      get: {
        operationId: "getOpenApiDocument",
        tags: ["Operational"],
        summary: "Return this OpenAPI document",
        responses: {
          ...commonErrors,
          "200": jsonResponse("OpenAPI 3.1 document"),
        },
      },
    },
    "/api/auth/csrf": {
      get: {
        operationId: "getCsrfToken",
        tags: ["Authentication"],
        summary: "Issue a signed CSRF token",
        description: "Sets a matching HttpOnly CSRF cookie. Use credentials: include and send the returned token in X-CSRF-Token on mutations.",
        "x-authenik8-credentials": "include",
        responses: {
          ...commonErrors,
          "200": jsonResponse("CSRF token and protected cookie", {
            type: "object",
            required: ["csrfToken"],
            properties: { csrfToken: { type: "string" } },
          }),
        },
      },
    },
    "/api/auth/register": {
      post: {
        operationId: "register",
        tags: ["Authentication"],
        summary: "Register with email and password",
        description: "Creates an unverified account and requests email verification. Does not create an authenticated session.",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        requestBody: requestBody("RegisterInput"),
        responses: {
          ...browserMutationErrors,
          "201": jsonResponse("Verification requested", ref("DeliveryMessage")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        operationId: "login",
        tags: ["Authentication"],
        summary: "Create a refresh session",
        description: "Returns a short-lived access token and sets the refresh token only in an HttpOnly cookie.",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        requestBody: requestBody("LoginInput"),
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Authenticated session", ref("AuthResponse")),
          "401": errorResponse("Invalid credentials"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        operationId: "refreshSession",
        tags: ["Authentication"],
        summary: "Rotate the refresh cookie",
        description: "Rotates the Redis-backed refresh session once. Clients must share one in-flight refresh and must not retry indefinitely.",
        "x-authenik8-credentials": "include",
        security: refreshSecurity,
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Rotated session", ref("AuthResponse")),
          "401": errorResponse("Replay or invalid session"),
          "409": errorResponse("Another refresh is already in progress"),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        operationId: "logout",
        tags: ["Authentication"],
        summary: "Revoke the current refresh session",
        description: "Revokes the active server session and clears the refresh cookie with the same cookie attributes.",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Signed out", ref("Message")),
        },
      },
    },
    "/api/auth/me": {
      get: {
        operationId: "getCurrentUser",
        tags: ["Authentication"],
        summary: "Return the authenticated user",
        "x-authenik8-requires-active-session": true,
        security: bearerSecurity,
        responses: {
          ...authenticatedErrors,
          "200": jsonResponse("Current user", ref("UserResponse")),
          "401": errorResponse("Authentication required"),
        },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        operationId: "forgotPassword",
        tags: ["Authentication"],
        summary: "Request a password reset",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        requestBody: requestBody("ForgotPasswordInput"),
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Generic delivery response", ref("DeliveryMessage")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/auth/reset-password": {
      post: {
        operationId: "resetPassword",
        tags: ["Authentication"],
        summary: "Consume a reset token and update the password",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        requestBody: requestBody("ResetPasswordInput"),
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Password updated", ref("Message")),
          "400": errorResponse("Invalid or expired reset token"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/auth/verify-email": {
      post: {
        operationId: "verifyEmail",
        tags: ["Authentication"],
        summary: "Consume an email verification token",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        requestBody: requestBody("VerificationInput"),
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Email verified", ref("Message")),
          "422": errorResponse("Validation error"),
          "400": errorResponse("Invalid or expired verification token"),
        },
      },
    },
    "/api/auth/resend-verification": {
      post: {
        operationId: "resendVerification",
        tags: ["Authentication"],
        summary: "Send another verification message",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Verification sent", ref("DeliveryMessage")),
          "401": errorResponse("Authentication required"),
        },
      },
    },
    "/api/auth/oauth/{provider}": {
      parameters: [providerParameter],
      get: {
        operationId: "startOAuth",
        tags: ["Authentication"],
        summary: "Start OAuth sign-in",
        description: "Navigate the browser to this endpoint. The API redirects to the selected provider.",
        responses: {
          ...commonErrors,
          "302": { description: "Redirect to the provider" },
          "404": errorResponse("Provider is not configured"),
          "422": errorResponse("Unsupported provider"),
        },
      },
    },
    "/api/auth/oauth/{provider}/link-intent": {
      parameters: [providerParameter],
      post: {
        operationId: "createOAuthLinkIntent",
        tags: ["Authentication", "Account"],
        summary: "Create a short-lived account-link intent",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Link intent created", {
            type: "object",
            required: ["url"],
            properties: { url: { type: "string" } },
          }),
          "404": errorResponse("Provider is not configured"),
          "422": errorResponse("Unsupported provider"),
        },
      },
    },
    "/api/auth/oauth/{provider}/link": {
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
        operationId: "startOAuthLink",
        tags: ["Authentication", "Account"],
        summary: "Consume a link intent and start provider authorization",
        responses: {
          ...commonErrors,
          "302": { description: "Redirect to the provider" },
          "400": errorResponse("Invalid or expired link intent"),
          "422": errorResponse("Unsupported provider or malformed ticket"),
        },
      },
    },
    "/api/auth/oauth/{provider}/callback": {
      parameters: [providerParameter],
      get: {
        operationId: "completeOAuthCallback",
        tags: ["Authentication"],
        summary: "Complete the provider callback",
        description: "Provider callback. On sign-in success, redirects to the configured frontend with a single-use 60-second exchange code, never an access or refresh token.",
        responses: {
          ...commonErrors,
          "302": { description: "Redirect to the SPA callback or settings page" },
        },
      },
    },
    "/api/auth/oauth/exchange": {
      post: {
        operationId: "exchangeOAuthCode",
        tags: ["Authentication"],
        summary: "Exchange a single-use OAuth code for a session",
        "x-authenik8-credentials": "include",
        security: csrfSecurity,
        requestBody: requestBody("OAuthExchangeInput"),
        responses: {
          ...browserMutationErrors,
          "200": jsonResponse("Authenticated session", ref("AuthResponse")),
          "400": errorResponse("Invalid or expired exchange code"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/account/profile": {
      get: {
        operationId: "getProfile",
        tags: ["Account"],
        summary: "Return the current account profile",
        "x-authenik8-requires-active-session": true,
        security: bearerSecurity,
        responses: {
          ...authenticatedErrors,
          "200": jsonResponse("Current profile", ref("UserResponse")),
        },
      },
      patch: {
        operationId: "updateProfile",
        tags: ["Account"],
        summary: "Update the current profile",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        requestBody: requestBody("ProfileInput"),
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Updated profile", ref("UserResponse")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/account/password": {
      put: {
        operationId: "changePassword",
        tags: ["Account"],
        summary: "Change the password and revoke every session",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        requestBody: requestBody("ChangePasswordInput"),
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Password updated", ref("Message")),
          "400": errorResponse("Current password is incorrect"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/account/sessions": {
      get: {
        operationId: "listSessions",
        tags: ["Account"],
        summary: "List active sessions",
        "x-authenik8-requires-active-session": true,
        security: bearerSecurity,
        responses: {
          ...authenticatedErrors,
          "200": jsonResponse("Active sessions", ref("SessionList")),
        },
      },
      delete: {
        operationId: "revokeOtherSessions",
        tags: ["Account"],
        summary: "Revoke every session except the current refresh session",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Other sessions revoked", {
            type: "object",
            required: ["message", "revoked"],
            properties: {
              message: { type: "string" },
              revoked: { type: "integer", minimum: 0 },
            },
          }),
          "400": errorResponse("Current refresh session is missing or inactive"),
        },
      },
    },
    "/api/account/sessions/{id}": {
      parameters: [idParameter],
      delete: {
        operationId: "revokeSession",
        tags: ["Account"],
        summary: "Revoke one owned session",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Session revoked", ref("Message")),
          "404": errorResponse("Session not found"),
          "422": errorResponse("Malformed session identifier"),
        },
      },
    },
    "/api/account/providers": {
      get: {
        operationId: "listLinkedProviders",
        tags: ["Account"],
        summary: "List linked OAuth providers",
        "x-authenik8-requires-active-session": true,
        security: bearerSecurity,
        responses: {
          ...authenticatedErrors,
          "200": jsonResponse("Linked providers", ref("ProviderList")),
        },
      },
    },
    "/api/account/providers/{provider}": {
      parameters: [providerParameter],
      delete: {
        operationId: "unlinkProvider",
        tags: ["Account"],
        summary: "Unlink an OAuth provider when another sign-in method remains",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Provider unlinked", ref("Message")),
          "400": errorResponse("Provider is the last available sign-in method"),
          "404": errorResponse("Provider is not linked"),
          "422": errorResponse("Unsupported provider"),
        },
      },
    },
    "/api/projects": {
      get: {
        operationId: "listProjects",
        tags: ["Projects"],
        summary: "List authorized projects",
        "x-authenik8-requires-active-session": true,
        security: bearerSecurity,
        responses: {
          ...authenticatedErrors,
          "200": jsonResponse("Project list", ref("ProjectList")),
        },
      },
      post: {
        operationId: "createProject",
        tags: ["Projects"],
        summary: "Create an owned project",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        requestBody: requestBody("ProjectCreateInput"),
        responses: {
          ...protectedMutationErrors,
          "201": jsonResponse("Project created", ref("ProjectResponse")),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/projects/{id}": {
      parameters: [idParameter],
      get: {
        operationId: "getProject",
        tags: ["Projects"],
        summary: "Read an authorized project",
        "x-authenik8-requires-active-session": true,
        security: bearerSecurity,
        responses: {
          ...authenticatedErrors,
          "200": jsonResponse("Project", ref("ProjectResponse")),
          "404": errorResponse("Not found or not authorized"),
          "422": errorResponse("Malformed project identifier"),
        },
      },
      patch: {
        operationId: "updateProject",
        tags: ["Projects"],
        summary: "Update an authorized project",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        requestBody: requestBody("ProjectUpdateInput"),
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Project updated", ref("ProjectResponse")),
          "404": errorResponse("Not found or not authorized"),
          "422": errorResponse("Validation error"),
        },
      },
      delete: {
        operationId: "deleteProject",
        tags: ["Projects"],
        summary: "Delete an authorized project",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "204": { description: "Project deleted" },
          "404": errorResponse("Not found or not authorized"),
          "422": errorResponse("Malformed project identifier"),
        },
      },
    },
    "/api/admin/users": {
      get: {
        operationId: "listUsers",
        tags: ["Administration"],
        summary: "List users",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-requires-admin": true,
        security: bearerSecurity,
        parameters: [pageParameter],
        responses: {
          ...administratorErrors,
          "200": jsonResponse("Paginated users", ref("UserPage")),
          "403": errorResponse("Administrator required"),
        },
      },
    },
    "/api/admin/users/{id}": {
      parameters: [idParameter],
      get: {
        operationId: "getUser",
        tags: ["Administration"],
        summary: "Return one user",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-requires-admin": true,
        security: bearerSecurity,
        responses: {
          ...administratorErrors,
          "200": jsonResponse("User", ref("UserResponse")),
          "404": errorResponse("User not found"),
          "422": errorResponse("Malformed user identifier"),
        },
      },
      patch: {
        operationId: "updateUser",
        tags: ["Administration"],
        summary: "Update a user role or status",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-requires-admin": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        requestBody: requestBody("AdminUserUpdateInput"),
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Updated user", ref("UserResponse")),
          "400": errorResponse("Self-lockout rejected"),
          "403": errorResponse("Administrator required"),
          "422": errorResponse("Validation error"),
        },
      },
    },
    "/api/admin/users/{id}/sessions": {
      parameters: [idParameter],
      delete: {
        operationId: "revokeUserSessions",
        tags: ["Administration"],
        summary: "Revoke every session for a user",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-requires-admin": true,
        "x-authenik8-credentials": "include",
        security: protectedMutationSecurity,
        responses: {
          ...protectedMutationErrors,
          "200": jsonResponse("Sessions revoked", ref("Message")),
          "403": errorResponse("Administrator required"),
          "422": errorResponse("Malformed user identifier"),
        },
      },
    },
    "/api/admin/audit": {
      get: {
        operationId: "listAuditEvents",
        tags: ["Administration"],
        summary: "List recent administrator audit events",
        "x-authenik8-requires-active-session": true,
        "x-authenik8-requires-admin": true,
        security: bearerSecurity,
        parameters: [pageParameter],
        responses: {
          ...administratorErrors,
          "200": jsonResponse("Paginated audit events", ref("AuditPage")),
          "403": errorResponse("Administrator required"),
        },
      },
    },
  },
} as const;
