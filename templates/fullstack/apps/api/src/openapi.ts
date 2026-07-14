export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Authenik8 Full-stack API", version: "1.0.0" },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } }, requestId: { type: "string" } } },
    },
  },
  paths: {
    "/auth/register": { post: { summary: "Register with email and password", responses: { "201": { description: "Verification requested" }, "422": { description: "Validation error" } } } },
    "/auth/login": { post: { summary: "Create a refresh session", responses: { "200": { description: "Access token and user" }, "401": { description: "Invalid credentials" } } } },
    "/auth/refresh": { post: { summary: "Rotate the refresh cookie", responses: { "200": { description: "Rotated session" }, "401": { description: "Replay or invalid session" } } } },
    "/auth/logout": { post: { summary: "Revoke the current refresh session", responses: { "200": { description: "Signed out" } } } },
    "/projects": {
      get: { summary: "List authorized projects", security: [{ bearerAuth: [] }], responses: { "200": { description: "Project list" } } },
      post: { summary: "Create an owned project", security: [{ bearerAuth: [] }], responses: { "201": { description: "Project created" } } },
    },
    "/projects/{id}": {
      get: { summary: "Read an authorized project", security: [{ bearerAuth: [] }], parameters: [{ in: "path", name: "id", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": { description: "Project" }, "404": { description: "Not found or not authorized" } } },
      patch: { summary: "Update an authorized project", security: [{ bearerAuth: [] }], responses: { "200": { description: "Project updated" } } },
      delete: { summary: "Delete an authorized project", security: [{ bearerAuth: [] }], responses: { "204": { description: "Project deleted" } } },
    },
    "/admin/users": { get: { summary: "List users", security: [{ bearerAuth: [] }], responses: { "200": { description: "Paginated users" }, "403": { description: "Administrator required" } } } },
    "/health/ready": { get: { summary: "Check database and Redis readiness", responses: { "200": { description: "Ready" } } } },
  },
} as const;
