import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  updateSession: vi.fn(),
  updateSessions: vi.fn(),
  transaction: vi.fn(),
  findResetToken: vi.fn(),
  refreshToken: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessions: vi.fn(),
  getdel: vi.fn(),
  set: vi.fn(),
  eval: vi.fn(),
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    REFRESH_SECRET: "test-refresh-secret-with-more-than-32-characters",
  },
}));
vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    session: {
      findUnique: mocks.findSession,
      update: mocks.updateSession,
      updateMany: mocks.updateSessions,
    },
    $transaction: mocks.transaction,
    passwordResetToken: { findUnique: mocks.findResetToken },
  },
}));
vi.mock("../src/config/mailer.js", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: () => ({
    refreshToken: mocks.refreshToken,
    revokeSession: mocks.revokeSession,
    revokeAllSessions: mocks.revokeAllSessions,
  }),
  redis: {
    getdel: mocks.getdel,
    set: mocks.set,
    eval: mocks.eval,
    setex: vi.fn(),
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(async () => "hashed-password"),
  },
}));

import { consumeLinkIntent, resetPassword, rotateSession } from "../src/auth/auth.service.js";

const activeSession = {
  id: "session-1",
  userId: "user-1",
  coreSessionId: "core-session-1",
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  user: {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    role: "USER",
    status: "ACTIVE",
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
  },
};

describe("session and one-time-token behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSession.mockResolvedValue(activeSession);
    mocks.updateSessions.mockResolvedValue({ count: 1 });
    mocks.revokeSession.mockResolvedValue(undefined);
    mocks.set.mockResolvedValue("OK");
    mocks.eval.mockResolvedValue(1);
    mocks.findResetToken.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  it("keeps the database session fail closed when core refresh fails", async () => {
    mocks.refreshToken.mockRejectedValue(new Error("Concurrent refresh detected"));

    await expect(rotateSession("refresh-token")).rejects.toMatchObject({
      status: 401,
      code: "REFRESH_REJECTED",
    });
    expect(mocks.updateSessions).toHaveBeenCalledWith(expect.objectContaining({
      data: { revokedAt: expect.any(Date) },
    }));
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("rejects an overlapping refresh before it reaches the identity engine", async () => {
    mocks.set.mockResolvedValue(null);

    await expect(rotateSession("refresh-token")).rejects.toMatchObject({
      status: 409,
      code: "REFRESH_IN_PROGRESS",
    });
    expect(mocks.findSession).not.toHaveBeenCalled();
    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });

  it("retains the consumed token lock briefly after a successful rotation", async () => {
    mocks.refreshToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });

    await expect(rotateSession("refresh-token")).resolves.toMatchObject({
      accessToken: "new-access-token",
    });
    expect(mocks.updateSession).toHaveBeenCalledOnce();
    expect(mocks.updateSession).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ revokedAt: null }),
    }));
    expect(mocks.eval).not.toHaveBeenCalled();
  });

  it("revokes the core session when the database cannot commit a rotation", async () => {
    mocks.refreshToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
    mocks.updateSession.mockRejectedValue(new Error("database unavailable"));

    await expect(rotateSession("refresh-token")).rejects.toThrow("database unavailable");
    expect(mocks.revokeSession).toHaveBeenCalledWith("user-1", activeSession.coreSessionId);
  });

  it("consumes OAuth link intents with one atomic Redis operation", async () => {
    mocks.getdel.mockResolvedValue("user-1");

    await expect(consumeLinkIntent("ticket-value")).resolves.toBe("user-1");
    expect(mocks.getdel).toHaveBeenCalledOnce();
    expect(mocks.getdel).toHaveBeenCalledWith("oauth:link:ticket-value");
  });

  it("does not update a password when another request already claimed the token", async () => {
    const transaction = {
      passwordResetToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: { update: vi.fn() },
      session: { updateMany: vi.fn() },
    };
    mocks.transaction.mockImplementation((operation) => operation(transaction));

    await expect(resetPassword("reset-token", "NewPassword1")).rejects.toMatchObject({
      status: 400,
      code: "RESET_TOKEN_INVALID",
    });
    expect(transaction.user.update).not.toHaveBeenCalled();
    expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
  });
});
