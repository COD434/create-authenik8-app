import express, { type Express, type Router } from "express";
import { createRequire } from "node:module";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenik8CoreMock = vi.hoisted(() => ({
  createAuthenik8: vi.fn(),
}));
const dotenvMock = vi.hoisted(() => ({
  config: vi.fn(),
}));

vi.mock("authenik8-core", () => ({
  createAuthenik8: authenik8CoreMock.createAuthenik8,
}));
vi.mock("dotenv", () => ({
  default: dotenvMock,
  config: dotenvMock.config,
}));

const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken") as {
  sign(payload: Record<string, unknown>, secret: string): string;
  verify(token: string, secret: string): Record<string, unknown>;
};

const jwtSecret = "templated-route-test-secret";

type HttpMethod = "delete" | "get";

type StoredSession = {
  token: string;
  device: string;
  ip: string;
  sessionId: string;
  createdAt: string;
};

class InMemoryRedis {
  private readonly hashes = new Map<string, Map<string, string>>();

  async hset(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }

  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }

  async hdel(key: string, field: string) {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    return hash.delete(field) ? 1 : 0;
  }

  async del(key: string) {
    return this.hashes.delete(key) ? 1 : 0;
  }

  async expire(_key: string, _ttl: number) {
    return 1;
  }

  clear() {
    this.hashes.clear();
  }

  async seedSession(userId: string, session: Partial<StoredSession> & { sessionId: string }) {
    const storedSession: StoredSession = {
      token: session.token ?? `stored-token-${session.sessionId}`,
      device: session.device ?? "Chrome on Linux",
      ip: session.ip ?? "127.0.0.1",
      sessionId: session.sessionId,
      createdAt: session.createdAt ?? "2026-05-02T00:00:00.000Z",
    };

    await this.hset(`sessions:${userId}`, session.sessionId, JSON.stringify(storedSession));
    await this.expire(`sessions:${userId}`, 60 * 60);
    return storedSession;
  }
}

const redis = new InMemoryRedis();
let redisForAuthFactory: InMemoryRedis | undefined;

const signTestToken = (payload: { id: string; role: string }) => jwt.sign(payload, jwtSecret);

const adminToken = () => signTestToken({ id: "admin-user", role: "admin" });
const userToken = () => signTestToken({ id: "regular-user", role: "user" });

const getBearerToken = (authorization: unknown) => {
  if (typeof authorization !== "string") return undefined;
  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" ? token : undefined;
};

const createAdminActions = (sessionStore: InMemoryRedis) => ({
  async listSessions(userId: string): Promise<StoredSession[]> {
    const rawSessions = await sessionStore.hgetall(`sessions:${userId}`);

    return Object.values(rawSessions).map(
      (serializedSession) => JSON.parse(serializedSession) as StoredSession,
    );
  },

  async revokeSession(userId: string, sessionId: string) {
    await sessionStore.hdel(`sessions:${userId}`, sessionId);
  },

  async revokeAllSessions(userId: string) {
    await sessionStore.del(`sessions:${userId}`);
  },
});

const createMockAuth = (sessionStore?: InMemoryRedis) => ({
  requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);

      if (decoded.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (sessionStore) {
        (req as express.Request & { adminActions?: ReturnType<typeof createAdminActions> }).adminActions =
          createAdminActions(sessionStore);
      }

      next();
    } catch {
      res.status(403).json({ error: "Forbidden" });
    }
  },

  authenticateJWT(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      jwt.verify(token, jwtSecret);
      next();
    } catch {
      res.status(403).json({ error: "Forbidden" });
    }
  },

  signToken: (payload: Record<string, unknown>) => jwt.sign(payload, jwtSecret),
  verifyToken: async (token: string) => jwt.verify(token, jwtSecret),
  guestToken: async (payload: Record<string, unknown>) => jwt.sign(payload, jwtSecret),
  refreshToken: async () => ({
    accessToken: jwt.sign({ id: "refreshed-user", role: "user" }, jwtSecret),
    refreshToken: "next-refresh-token",
  }),
  incognito: vi.fn(),
  rateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  ipWhitelist: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  helmet: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
});

const appWithRouter = (router: Router) => {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
};

const send = (app: Express, method: HttpMethod, path: string) => {
  if (method === "delete") {
    return request(app).delete(path);
  }

  return request(app).get(path);
};

type RouteTemplate = {
  name: string;
  guardedRoute: { method: HttpMethod; path: string; expectedBody: Record<string, string> };
  createApp(redis?: InMemoryRedis): Promise<Express>;
};

const routeTemplates: RouteTemplate[] = [
  {
    name: "templates/express-auth/src/routes/protected.routes.ts",
    guardedRoute: {
      method: "get",
      path: "/protected",
      expectedBody: { message: "Protected route" },
    },
    async createApp(sessionStore?: InMemoryRedis) {
      const { createProtectedRoutes } = await import(
        "../../templates/express-auth/src/routes/protected.routes.js"
      );

      return appWithRouter(createProtectedRoutes(createMockAuth(sessionStore)));
    },
  },
  {
    name: "templates/express-base/routes/base.routes.ts",
    guardedRoute: {
      method: "get",
      path: "/admin",
      expectedBody: { message: "Admin only" },
    },
    async createApp(sessionStore?: InMemoryRedis) {
      const { createBaseRoutes } = await import("../../templates/express-base/routes/base.routes.js");

      return appWithRouter(createBaseRoutes(createMockAuth(sessionStore)));
    },
  },
  {
    name: "templates/express-auth+/src/auth/protected.routes.ts",
    guardedRoute: {
      method: "get",
      path: "/protected",
      expectedBody: { message: "Protected route" },
    },
    async createApp(sessionStore?: InMemoryRedis) {
      redisForAuthFactory = sessionStore;
     // const [{ initAuth }, { default: protectedRoutes }] = await Promise.all([
       // import("../../templates/express-auth+/src/auth/auth.js"),
       // import("../../templates/express-auth+/src/auth/protected.routes.js"),
      //]);
const authModule = await import("../../templates/express-auth+/src/auth/auth.js");
  const routesModule = await import("../../templates/express-auth+/src/auth/protected.routes.js");

  await authModule.initAuth();

//      await initAuth();
     const protectedRoutes = routesModule.default as unknown as Router ;
      return appWithRouter(protectedRoutes);
    },
  },
];

const sessionRoutes = [
  {
    name: "list sessions",
    method: "get" as const,
    path: "/admin/sessions/user-a",
  },
  {
    name: "revoke one session",
    method: "delete" as const,
    path: "/admin/sessions/user-a/session-a",
  },
  {
    name: "revoke all sessions",
    method: "delete" as const,
    path: "/admin/sessions/user-a",
  },
];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("JWT_SECRET", "templated-route-test-jwt-secret-32");
  vi.stubEnv("REFRESH_SECRET", "templated-route-test-refresh-secret-32");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://example.com/auth/google/callback");
  vi.stubEnv("GITHUB_CLIENT_ID", "github-client-id");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "github-client-secret");
  vi.stubEnv("GITHUB_REDIRECT_URI", "https://example.com/auth/github/callback");
  redis.clear();
  redisForAuthFactory = undefined;
  dotenvMock.config.mockReset();
  authenik8CoreMock.createAuthenik8.mockReset();
  authenik8CoreMock.createAuthenik8.mockImplementation(async () =>
    createMockAuth(redisForAuthFactory),
  );
});

describe.each(routeTemplates)("$name", (template) => {
  describe("admin guard", () => {
    const guardedRoutes = [template.guardedRoute, ...sessionRoutes];

    it.each(guardedRoutes)("returns 401 with no token for $method $path", async (route) => {
      const app = await template.createApp(redis);

      const response = await send(app, route.method, route.path);

      expect(response.status).toBe(401);
    });

    it.each(guardedRoutes)("returns 403 for non-admin users on $method $path", async (route) => {
      const app = await template.createApp(redis);

      const response = await send(app, route.method, route.path).set(
        "Authorization",
        `Bearer ${userToken()}`,
      );

      expect(response.status).toBe(403);
    });

    it.each(guardedRoutes)(
      "returns 403 for unauthenticated invalid tokens on $method $path",
      async (route) => {
        const app = await template.createApp(redis);

        const response = await send(app, route.method, route.path).set(
          "Authorization",
          "Bearer not-a-valid-token",
        );

        expect(response.status).toBe(403);
      },
    );

    it(`returns the happy path response for ${template.guardedRoute.method} ${template.guardedRoute.path}`, async () => {
      const app = await template.createApp(redis);

      const response = await send(
        app,
        template.guardedRoute.method,
        template.guardedRoute.path,
      ).set("Authorization", `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(template.guardedRoute.expectedBody);
    });
  });

  describe("session management", () => {
    it.each(sessionRoutes)(
      "returns 503 for $method $path when Redis is not configured",
      async (route) => {
        const app = await template.createApp(undefined);

        const response = await send(app, route.method, route.path).set(
          "Authorization",
          `Bearer ${adminToken()}`,
        );

        expect(response.status).toBe(503);
        expect(response.body).toEqual({
          success: false,
          message: "Session management unavailable",
        });
      },
    );

    it("lists sessions without exposing stored tokens", async () => {
      const app = await template.createApp(redis);
      await redis.seedSession("user-a", {
        sessionId: "session-a",
        token: "sensitive-token-a",
        device: "Firefox on macOS",
        ip: "10.0.0.1",
      });
      await redis.seedSession("user-a", {
        sessionId: "session-b",
        token: "sensitive-token-b",
        device: "Safari on iOS",
        ip: "10.0.0.2",
      });

      const response = await request(app)
        .get("/admin/sessions/user-a")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions).toEqual([
        {
          device: "Firefox on macOS",
          ip: "10.0.0.1",
          sessionId: "session-a",
          createdAt: "2026-05-02T00:00:00.000Z",
        },
        {
          device: "Safari on iOS",
          ip: "10.0.0.2",
          sessionId: "session-b",
          createdAt: "2026-05-02T00:00:00.000Z",
        },
      ]);
      expect(JSON.stringify(response.body)).not.toContain("sensitive-token");
      expect(response.body.sessions).toEqual(
        expect.arrayContaining([expect.not.objectContaining({ token: expect.anything() })]),
      );
    });

    it("revokes one session without affecting other sessions or users", async () => {
      const app = await template.createApp(redis);
      await redis.seedSession("user-a", { sessionId: "session-a", token: "user-a-token-a" });
      await redis.seedSession("user-a", { sessionId: "session-b", token: "user-a-token-b" });
      await redis.seedSession("user-b", { sessionId: "session-c", token: "user-b-token-c" });

      const response = await request(app)
        .delete("/admin/sessions/user-a/session-a")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: "Session revoked" });
      expect(await redis.hgetall("sessions:user-a")).toEqual({
        "session-b": expect.any(String),
      });
      expect(await redis.hgetall("sessions:user-b")).toEqual({
        "session-c": expect.any(String),
      });
    });

    it("revokes all sessions for only the targeted user", async () => {
      const app = await template.createApp(redis);
      await redis.seedSession("user-a", { sessionId: "session-a", token: "user-a-token-a" });
      await redis.seedSession("user-a", { sessionId: "session-b", token: "user-a-token-b" });
      await redis.seedSession("user-b", { sessionId: "session-c", token: "user-b-token-c" });

      const response = await request(app)
        .delete("/admin/sessions/user-a")
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: "All sessions revoked" });
      expect(await redis.hgetall("sessions:user-a")).toEqual({});
      expect(await redis.hgetall("sessions:user-b")).toEqual({
        "session-c": expect.any(String),
      });
    });
  });
});
