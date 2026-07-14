import { describe, expect, it, vi } from "vitest";
import { refreshCookieOptions } from "../src/auth/cookies.js";
import { requireAllowedOrigin } from "../src/middleware/origin.js";

describe("browser session defenses", () => {
  it("restricts the refresh cookie", () => {
    expect(refreshCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/api/auth",
    });
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
