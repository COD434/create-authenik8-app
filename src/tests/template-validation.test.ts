import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseCredentials as parseAuthCredentials,
  parseRefreshToken,
} from "../../templates/express-auth/src/utils/security";
<<<<<<< HEAD
import {
  parseCredentials as parseOAuthCredentials,
  parseRefreshToken as parseOAuthRefreshToken,
} from "../../templates/express-auth+/src/utils/security";
=======
import { parseCredentials as parseOAuthCredentials } from "../../templates/express-auth+/src/utils/security";
>>>>>>> main
import {
  agentIdentityConfig,
  authJwkConfig,
  parseIdentifier,
  parseRefreshToken as parseBaseRefreshToken,
} from "../../templates/express-base/utils/security";
import { registerSchema } from "../../templates/fullstack/packages/contracts/src/index";

describe("template Zod validation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([parseAuthCredentials, parseOAuthCredentials])(
    "normalizes credential input without modifying passwords",
    (parseCredentials) => {
      expect(parseCredentials({
        email: "  USER@Example.COM ",
        password: "ValidPassword1",
      })).toEqual({ email: "user@example.com", password: "ValidPassword1" });
    },
  );

  it.each([parseAuthCredentials, parseOAuthCredentials])(
    "rejects weak, malformed, or over-posted credentials",
    (parseCredentials) => {
      expect(() => parseCredentials({ email: "bad", password: "short" })).toThrow();
      expect(() => parseCredentials({
        email: "user@example.com",
        password: "ValidPassword1",
        role: "ADMIN",
      })).toThrow();
    },
  );

  it("validates refresh tokens and route identifiers", () => {
    const body = { refreshToken: "  abcdefghijklmnop  " };
    expect(parseRefreshToken(body)).toBe("abcdefghijklmnop");
<<<<<<< HEAD
    expect(parseOAuthRefreshToken(body)).toBe("abcdefghijklmnop");
=======
>>>>>>> main
    expect(parseBaseRefreshToken(body)).toBe("abcdefghijklmnop");
    expect(parseIdentifier(" user-1 ", "User ID")).toBe("user-1");
    expect(() => parseIdentifier("../user", "User ID")).toThrow("User ID is invalid");
  });

  it("normalizes fullstack registration fields", () => {
    expect(registerSchema.parse({
      name: "  Jane   Example ",
      email: " JANE@EXAMPLE.COM ",
      password: "SecurePass1",
    })).toMatchObject({ name: "Jane Example", email: "jane@example.com" });
  });

  it("loads a rotation-ready signing key ring and requires a private active key", () => {
    const oldPublicKey = {
      kty: "EC",
      crv: "P-256",
      x: "old-x",
      y: "old-y",
      kid: "old-key",
      alg: "ES256",
      use: "sig",
    };
    const activePrivateKey = {
      ...oldPublicKey,
      x: "active-x",
      y: "active-y",
      d: "active-d",
      kid: "active-key",
    };
    vi.stubEnv("AUTHENIK8_SIGNING_JWKS", JSON.stringify([
      oldPublicKey,
      activePrivateKey,
    ]));
    vi.stubEnv("AUTHENIK8_ACTIVE_KID", "active-key");
    vi.stubEnv("AUTHENIK8_ISSUER", "https://issuer.example.test");
    vi.stubEnv("AUTHENIK8_AUDIENCE", "example-api");

    expect(authJwkConfig()).toEqual({
      keys: [oldPublicKey, activePrivateKey],
      activeKid: "active-key",
      issuer: "https://issuer.example.test",
      audience: "example-api",
    });

    vi.stubEnv("AUTHENIK8_ACTIVE_KID", "old-key");
    expect(() => authJwkConfig()).toThrow(
      "AUTHENIK8_ACTIVE_KID must select a private signing JWK",
    );
  });

  it("enables only validated, explicitly configured agent identities", async () => {
    expect(agentIdentityConfig()).toBeUndefined();

    vi.stubEnv(
      "AUTHENIK8_AGENTS",
      JSON.stringify({ "build-worker": ["tasks:read", "tasks:write"] }),
    );
    const config = agentIdentityConfig();
    await expect(config?.resolveAgent("build-worker")).resolves.toEqual({
      agentId: "build-worker",
      scopes: ["tasks:read", "tasks:write"],
      active: true,
    });
    await expect(config?.resolveAgent("unknown")).resolves.toBeNull();
    await expect(config?.resolveAgent("constructor")).resolves.toBeNull();
    expect(config?.authorizeDelegation).toBeUndefined();

    vi.stubEnv("AUTHENIK8_AGENTS", JSON.stringify({ worker: ["ADMIN"] }));
    expect(() => agentIdentityConfig()).toThrow("resource:action scopes");

    vi.stubEnv(
      "AUTHENIK8_AGENTS",
      JSON.stringify({ worker: [`tasks:${"r".repeat(123)}`] }),
    );
    expect(() => agentIdentityConfig()).toThrow("resource:action scopes");
  });
});
