import { describe, expect, it, vi } from "vitest";

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
import { requireAllowedOrigin } from "../src/middleware/origin.js";

describe("browser session defenses", () => {
  it("restricts the refresh cookie", () => {
    expect(refreshCookieOptions()).toMatchObject({
      httpOnly: true,
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

  it("allows the local preview origin during development", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAllowedOrigin(
      { get: () => "http://localhost:4173", id: "request-2" } as never,
      { status, json } as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
