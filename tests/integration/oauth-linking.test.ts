import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateProjectFixture,
  installGeneratedAppStubs,
} from "../helpers/generator.js";

type TestResponse = {
  body?: unknown;
  headersSent: boolean;
  statusCode: number;
  json(body: unknown): TestResponse;
  status(code: number): TestResponse;
};

function testResponse(): TestResponse {
  return {
    headersSent: false,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as any).__authenik8MockConfig;
});

describe("generated Express OAuth account linking", () => {
  it("exchanges an authenticated intent for a browser-safe one-use redirect", async () => {
    const project = await generateProjectFixture({
      template: "auth-oauth",
      database: "sqlite",
      hashLib: "bcryptjs",
      oauthProviders: ["google"],
    });

    try {
      await installGeneratedAppStubs(project.targetDir, { realRedis: true });
      const generatedEnv = await fs.readFile(path.join(project.targetDir, ".env"), "utf8");
      vi.stubEnv(
        "AUTHENIK8_SIGNING_JWKS",
        generatedEnv.match(/^AUTHENIK8_SIGNING_JWKS='(.+)'$/m)?.[1] ?? "",
      );
      vi.stubEnv(
        "AUTHENIK8_ACTIVE_KID",
        generatedEnv.match(/^AUTHENIK8_ACTIVE_KID=(.+)$/m)?.[1] ?? "",
      );
      vi.stubEnv("AUTHENIK8_ISSUER", "http://localhost:3000");
      vi.stubEnv("AUTHENIK8_AUDIENCE", "generated-app-api");
      vi.stubEnv("AUTHENIK8_AGENTS", "{}");
      vi.stubEnv("REFRESH_SECRET", "test-refresh-secret-must-be-at-least-32-characters");
      vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
      vi.stubEnv("GOOGLE_REDIRECT_URI", "https://example.com/auth/google/callback");

      const authUrl = pathToFileURL(path.join(project.targetDir, "src/auth/auth.ts")).href;
      const controllerUrl = pathToFileURL(
        path.join(project.targetDir, "src/auth/controllers/oauth.controller.ts"),
      ).href;
      const authModule = await import(/* @vite-ignore */ authUrl);
      await authModule.initAuth();
      const auth = authModule.getAuth();
      auth.redisclient = (globalThis as any).__authenik8MockConfig.redis;
      const redirect = vi.fn();
      auth.oauth.google.redirect = redirect;
      const { oauthController } = await import(/* @vite-ignore */ controllerUrl);

      const unauthorized = testResponse();
      await oauthController.googleLinkIntent({ user: {} }, unauthorized);
      expect(unauthorized.statusCode).toBe(401);

      const intentResponse = testResponse();
      await oauthController.googleLinkIntent(
        { user: { userId: "user-1" } },
        intentResponse,
      );
      expect(intentResponse.statusCode).toBe(201);
      expect(intentResponse.body).toMatchObject({ expiresIn: 120 });
      const url = (intentResponse.body as { url: string }).url;
      const ticket = new URL(url, "http://localhost:3000").searchParams.get("ticket");
      expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const linkRequest = { query: { ticket } };
      const linkResponse = testResponse();
      await oauthController.googleLink(linkRequest, linkResponse);
      expect(linkRequest).toMatchObject({ user: { userId: "user-1" } });
      expect(redirect).toHaveBeenCalledWith(linkRequest, linkResponse, "link");

      const replayResponse = testResponse();
      await oauthController.googleLink({ query: { ticket } }, replayResponse);
      expect(replayResponse.statusCode).toBe(400);

      const routes = await fs.readFile(
        path.join(project.targetDir, "src/auth/routes/oauth.routes.ts"),
        "utf8",
      );
      expect(routes).toContain(
        'router.post("/google/link-intent", authMiddleware, oauthController.googleLinkIntent);',
      );
      expect(routes).toContain(
        'router.get("/google/link", oauthController.googleLink);',
      );
      expect(routes).not.toContain(
        'router.get("/google/link", authMiddleware',
      );

      auth.redisclient.disconnect();
    } finally {
      await project.cleanup();
    }
  });
});
