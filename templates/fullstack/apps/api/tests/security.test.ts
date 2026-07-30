import { describe, expect, it, vi } from "vitest";
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 77891ef ( chore: ci mess)

vi.mock("../src/config/env.js", () => ({
  env: {
    COOKIE_SECURE: false,
    NODE_ENV: "test",
    REFRESH_SECRET: "test-refresh-secret-with-more-than-32-characters",
    WEB_ORIGIN: "http://localhost:5173",
  },
}));

import { readRefreshCookie, refreshCookieName, refreshCookieOptions, setRefreshCookie } from "../src/auth/cookies.js";
import { csrfCookieName, issueCsrfToken, requireCsrf } from "../src/middleware/csrf.js";
<<<<<<< HEAD
=======
import { refreshCookieOptions } from "../src/auth/cookies.js";
>>>>>>> befe6e3 (feat:new presets)
=======
>>>>>>> 77891ef ( chore: ci mess)
import { requireAllowedOrigin } from "../src/middleware/origin.js";
import { exactHttpOriginSchema } from "../src/config/exact-origin.js";

describe("browser session defenses", () => {
  it("restricts the refresh cookie", () => {
    expect(refreshCookieOptions()).toMatchObject({
      httpOnly: true,
<<<<<<< HEAD
<<<<<<< HEAD
      sameSite: "strict",
      path: "/api",
    });
  });

  it("encrypts refresh tokens before cookie storage", () => {
    const cookie = vi.fn();
    const rawToken = "refresh-token-value";
    setRefreshCookie({ cookie } as never, rawToken);

    const sealedToken = cookie.mock.calls[0]?.[1] as string;
    expect(sealedToken).not.toContain(rawToken);
    expect(readRefreshCookie({ cookies: { [refreshCookieName]: sealedToken } } as never)).toBe(rawToken);
    expect(readRefreshCookie({ cookies: { [refreshCookieName]: `${sealedToken}tampered` } } as never)).toBeUndefined();
  });

  it("requires the signed CSRF cookie and matching request header", () => {
    const cookie = vi.fn();
    const token = issueCsrfToken({ cookies: {} } as never, { cookie } as never);
    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    requireCsrf(
      { cookies: { [csrfCookieName]: token }, get: () => token, id: "request-3" } as never,
      { status, json } as never,
      next,
    );

    expect(cookie).toHaveBeenCalledWith(csrfCookieName, token, expect.objectContaining({ httpOnly: true, sameSite: "strict" }));
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects a missing or mismatched CSRF token without disclosing it", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireCsrf(
      { cookies: {}, get: () => undefined, id: "request-4" } as never,
      { status, json } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: "CSRF_REJECTED", message: "Request verification failed" },
      requestId: "request-4",
    });
    expect(next).not.toHaveBeenCalled();
  });

=======
      sameSite: "lax",
      path: "/api/auth",
    });
  });

>>>>>>> befe6e3 (feat:new presets)
=======
      sameSite: "strict",
      path: "/api",
    });
  });

  it("encrypts refresh tokens before cookie storage", () => {
    const cookie = vi.fn();
    const rawToken = "refresh-token-value";
    setRefreshCookie({ cookie } as never, rawToken);

    const sealedToken = cookie.mock.calls[0]?.[1] as string;
    expect(sealedToken).not.toContain(rawToken);
    expect(readRefreshCookie({ cookies: { [refreshCookieName]: sealedToken } } as never)).toBe(rawToken);
    expect(readRefreshCookie({ cookies: { [refreshCookieName]: `${sealedToken}tampered` } } as never)).toBeUndefined();
  });

  it("requires the signed CSRF cookie and matching request header", () => {
    const cookie = vi.fn();
    const token = issueCsrfToken({ cookies: {} } as never, { cookie } as never);
    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    requireCsrf(
      { cookies: { [csrfCookieName]: token }, get: () => token, id: "request-3" } as never,
      { status, json } as never,
      next,
    );

    expect(cookie).toHaveBeenCalledWith(csrfCookieName, token, expect.objectContaining({ httpOnly: true, sameSite: "strict" }));
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects a missing or mismatched CSRF token without disclosing it", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireCsrf(
      { cookies: {}, get: () => undefined, id: "request-4" } as never,
      { status, json } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: "CSRF_REJECTED", message: "Request verification failed" },
      requestId: "request-4",
    });
    expect(next).not.toHaveBeenCalled();
  });

>>>>>>> 77891ef ( chore: ci mess)
  it("rejects a mismatched cookie request origin", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAllowedOrigin(
      { get: () => "https://attacker.example", id: "request-1" } as never,
      { status, json } as never,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "ORIGIN_REJECTED" }) }));
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the configured browser origin", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAllowedOrigin(
      { get: () => "http://localhost:5173", id: "request-2" } as never,
      { status, json } as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

<<<<<<< HEAD
  it("rejects missing, null, and lookalike origins for cookie-driven mutations", () => {
    for (const origin of [undefined, "null", "http://localhost:5173.attacker.example"]) {
      const status = vi.fn().mockReturnThis();
      const next = vi.fn();
      requireAllowedOrigin(
        { get: () => origin, id: "request-origin" } as never,
        { status, json: vi.fn() } as never,
        next,
      );
      expect(status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("normalizes a trailing slash but rejects wildcards and URL paths", () => {
    expect(exactHttpOriginSchema.parse("https://app.example.com/")).toBe(
      "https://app.example.com",
    );
    expect(exactHttpOriginSchema.safeParse("*").success).toBe(false);
    expect(exactHttpOriginSchema.safeParse("https://app.example.com/login").success).toBe(false);
  });

=======
>>>>>>> 69568dd (feat:fixed merge conflict)
  it("rejects an unconfigured loopback port during development", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAllowedOrigin(
      { get: () => "http://localhost:4173", id: "request-5" } as never,
      { status, json } as never,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
