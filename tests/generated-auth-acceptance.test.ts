import path from "node:path";
import { pathToFileURL } from "node:url";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import {
  generateProjectFixture,
  installGeneratedAppStubs,
} from "./helpers/generator.js";

class MemoryRedis {
  private readonly strings = new Map<string, string>();
  private readonly hashes = new Map<string, Map<string, string>>();

  on() {
    return this;
  }

  async set(key: string, value: string, ...args: unknown[]) {
    if (args.includes("NX") && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return "OK";
  }

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async getset(key: string, value: string) {
    const previous = this.strings.get(key) ?? null;
    this.strings.set(key, value);
    return previous;
  }

  async del(key: string) {
    const stringDeleted = this.strings.delete(key);
    const hashDeleted = this.hashes.delete(key);
    return stringDeleted || hashDeleted ? 1 : 0;
  }

  async expire() {
    return 1;
  }

  async exists(key: string) {
    return this.strings.has(key) || this.hashes.has(key) ? 1 : 0;
  }

  async hset(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }

  async hget(key: string, field: string) {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }

  async hdel(key: string, field: string) {
    return this.hashes.get(key)?.delete(field) ? 1 : 0;
  }

  async eval(_script: string, _keyCount: number, key: string, value: string) {
    if (this.strings.get(key) !== value) return 0;
    this.strings.delete(key);
    return 1;
  }
}

afterEach(() => {
  delete (globalThis as any).__generatedPrismaUsers;
});

describe("generated authentication acceptance", () => {
  it("registers, logs in, authorizes, and refreshes with the published core package", async () => {
    const project = await generateProjectFixture({
      template: "auth",
      database: "sqlite",
      hashLib: "bcryptjs",
    });

    try {
      await installGeneratedAppStubs(project.targetDir, {
        realAuthCore: true,
        realExpress: true,
      });

      const coreUrl = pathToFileURL(
        path.join(project.targetDir, "node_modules/authenik8-core/dist/index.js"),
      ).href;
      const appUrl = pathToFileURL(path.join(project.targetDir, "src/app.ts")).href;
      const { createAuthenik8, generateSigningJwk } = await import(/* @vite-ignore */ coreUrl);
      const { createApp } = await import(/* @vite-ignore */ appUrl);
      const signingKey = await generateSigningJwk("acceptance-key");
      const auth = await createAuthenik8({
        jwt: {
          keys: [signingKey],
          activeKid: "acceptance-key",
          issuer: "https://acceptance.example.test",
          audience: "acceptance-api",
        },
        refreshSecret: "acceptance-refresh-secret-must-be-at-least-32-characters",
        redis: new MemoryRedis(),
        agent: {
          resolveAgent: async (agentId: string) => agentId === "acceptance-worker"
            ? {
                agentId,
                scopes: ["tasks:read", "tasks:write"],
                active: true,
              }
            : null,
          authorizeDelegation: async ({ user, requestedScopes }: any) =>
            user.role === "user" && requestedScopes.every((scope: string) => scope === "tasks:read"),
        },
      });
      auth.rateLimit = (_req: unknown, _res: unknown, next: () => void) => next();
      const app = createApp(auth);
      app.get(
        "/agent/tasks",
        auth.agent.requireScopes("tasks:read"),
        (req: any, res: any) => res.json({ agentId: req.agent.agentId }),
      );
      const credentials = {
        email: "acceptance@example.com",
        password: "SecurePassword1",
      };

      const registration = await request(app).post("/auth/register").send(credentials);
      expect(registration.status).toBe(200);
      expect(registration.body).toMatchObject({ message: "User created", userId: "user-1" });

      const login = await request(app).post("/auth/login").send(credentials);
      expect(login.status).toBe(200);
      expect(login.body.accessToken).toEqual(expect.any(String));
      expect(login.body.refreshToken).toEqual(expect.any(String));
      expect(login.body.accessToken.split(".")).toHaveLength(3);
      await expect(auth.verifyToken(login.body.accessToken)).resolves.toMatchObject({
        userId: "user-1",
        role: "user",
      });

      const machine = await auth.agent.issueToken({
        agentId: "acceptance-worker",
        scopes: ["tasks:read"],
      });
      await expect(auth.agent.verifyToken(machine.accessToken)).resolves.toMatchObject({
        tokenUse: "agent",
        actorChain: [{ type: "agent", id: "acceptance-worker" }],
      });
      await expect(auth.verifyToken(machine.accessToken)).resolves.toBeNull();
      await request(app)
        .get("/agent/tasks")
        .set("Authorization", `Bearer ${machine.accessToken}`)
        .expect(200, { agentId: "acceptance-worker" });

      const delegated = await auth.agent.issueDelegatedToken({
        agentId: "acceptance-worker",
        userAccessToken: login.body.accessToken,
        scopes: ["tasks:read"],
      });
      await expect(auth.agent.verifyToken(delegated.accessToken)).resolves.toMatchObject({
        tokenUse: "agent-delegation",
        delegatedUserId: "user-1",
        actorChain: [
          { type: "user", id: "user-1" },
          { type: "agent", id: "acceptance-worker" },
        ],
      });

      const protectedResponse = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${login.body.accessToken}`);
      expect(protectedResponse.status).toBe(200);
      expect(protectedResponse.body).toEqual({ message: "Protected route" });

      expect(auth.getJwks()).toMatchObject({
        keys: [expect.objectContaining({ kid: "acceptance-key", alg: "ES256" })],
      });
      expect(auth.getJwks().keys[0]).not.toHaveProperty("d");

      const refresh = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: login.body.refreshToken });
      expect(refresh.status).toBe(200);
      expect(refresh.body.accessToken).toEqual(expect.any(String));
      expect(refresh.body.refreshToken).toEqual(expect.any(String));

      const accessPayload = await auth.verifyToken(refresh.body.accessToken);
      await auth.revokeSession(accessPayload.userId, accessPayload.sessionId);

      const revokedAccess = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${refresh.body.accessToken}`);
      expect(revokedAccess.status).toBe(403);

      const revokedRefresh = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: refresh.body.refreshToken });
      expect(revokedRefresh.status).toBe(401);
      await expect(auth.agent.verifyToken(delegated.accessToken)).resolves.toBeNull();

      await auth.agent.revokeAgent("acceptance-worker");
      await expect(auth.agent.verifyToken(machine.accessToken)).resolves.toBeNull();
    } finally {
      await project.cleanup();
    }
  });
});
