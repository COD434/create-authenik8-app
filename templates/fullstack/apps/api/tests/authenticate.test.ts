import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("../src/config/prisma.js", () => ({
  prisma: { session: { findFirst: mocks.findSession } },
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: () => ({ requireAuth: mocks.requireAuth }),
}));

import { authenticate } from "../src/middleware/authenticate.js";

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn(function status(this: typeof res, value: number) {
      this.statusCode = value;
      return this;
    }),
    json: vi.fn(function json(this: typeof res, value: unknown) {
      this.body = value;
      return this;
    }),
  };
  return res;
}

describe("application authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes identity-engine token failures to a refreshable 401", async () => {
    mocks.requireAuth.mockImplementation((_req, res) =>
      res.status(403).json({ success: false, message: "invalid session" }));
    const res = response();
    const next = vi.fn();

    await authenticate({ id: "request-1" } as never, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
      requestId: "request-1",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("hydrates active users after the identity engine accepts the token", async () => {
    mocks.requireAuth.mockImplementation((req, _res, next) => {
      req.user = { userId: "user-1", sessionId: "session-1" };
      return next();
    });
    mocks.findSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        role: "USER",
        status: "ACTIVE",
      },
    });
    const req = { id: "request-2" };
    const res = response();
    const next = vi.fn();

    await authenticate(req as never, res as never, next);

    expect(req).toMatchObject({
      user: {
        userId: "user-1",
        email: "user@example.com",
        name: "User",
        role: "USER",
      },
    });
    expect(next).toHaveBeenCalledOnce();
    expect(mocks.findSession).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        coreSessionId: "session-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      include: { user: true },
    });
  });

  it("rejects a core-valid token when its database session is not active", async () => {
    mocks.requireAuth.mockImplementation((req, _res, next) => {
      req.user = { userId: "user-1", sessionId: "revoked-session" };
      return next();
    });
    mocks.findSession.mockResolvedValue(null);
    const res = response();
    const next = vi.fn();

    await authenticate({ id: "request-3" } as never, res as never, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: { code: "SESSION_INVALID", message: "This session is no longer active" },
      requestId: "request-3",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
