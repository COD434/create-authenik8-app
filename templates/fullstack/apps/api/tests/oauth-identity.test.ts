import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  findUser: vi.fn(),
  verifyToken: vi.fn(),
  revokeSession: vi.fn(),
  setex: vi.fn(),
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    REFRESH_SECRET: "test-refresh-secret-with-more-than-32-characters",
  },
}));
vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    session: { create: mocks.createSession },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("../src/config/mailer.js", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: () => ({
    verifyToken: mocks.verifyToken,
    revokeSession: mocks.revokeSession,
  }),
  redis: {
    setex: mocks.setex,
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import { completeOAuthCallback } from "../src/auth/auth.service.js";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.com",
  name: "User",
  role: "USER",
  status: "ACTIVE",
  emailVerifiedAt: new Date(),
  passwordHash: null,
  passwordUpdatedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const request = {
  get: () => "Test browser",
  ip: "127.0.0.1",
} as never;

function callbackResult(identity: Record<string, unknown>) {
  return {
    profile: {
      email: user.email,
      provider: "google",
      providerId: "google-user",
      email_verified: true,
    },
    mode: "login",
    userId: null,
    identity,
    accessToken: "core-access-token",
    refreshToken: "core-refresh-token",
  } as never;
}

describe("OAuth identity ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue(user);
    mocks.verifyToken.mockResolvedValue({
      userId: user.id,
      sessionId: "core-session-1",
    });
    mocks.createSession.mockResolvedValue({ id: "database-session-1" });
    mocks.revokeSession.mockResolvedValue(undefined);
    mocks.setex.mockResolvedValue("OK");
  });

  it("registers the session returned by the core identity engine", async () => {
    const result = await completeOAuthCallback(
      "google",
      callbackResult({
        type: "NEW_USER_CREATION",
        user: {
          id: user.id,
          email: user.email,
          role: "user",
          providers: [{ provider: "google", providerId: "google-user" }],
        },
      }),
      request,
    );

    expect(result).toMatchObject({ linked: false, code: expect.any(String) });
    expect(mocks.findUser).toHaveBeenCalledWith({ where: { id: user.id } });
    expect(mocks.createSession).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        coreSessionId: "core-session-1",
      }),
    });
    expect(mocks.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth:exchange:/),
      60,
      expect.any(String),
    );
  });

  it("preserves the core explicit-linking policy", async () => {
    await expect(completeOAuthCallback(
      "google",
      callbackResult({
        type: "LINK_REQUIRED",
        message: "please link manually",
        email: user.email,
        provider: "google",
      }),
      request,
    )).rejects.toMatchObject({
      status: 409,
      code: "OAUTH_LINK_REQUIRED",
    });

    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("compensates in core when the application session cannot be registered", async () => {
    mocks.createSession.mockRejectedValue(new Error("database unavailable"));

    await expect(completeOAuthCallback(
      "google",
      callbackResult({
        type: "EXISTING_PROVIDER_LOGIN",
        user: {
          id: user.id,
          email: user.email,
          role: "user",
          providers: [{ provider: "google", providerId: "google-user" }],
        },
      }),
      request,
    )).rejects.toThrow("database unavailable");

    expect(mocks.revokeSession).toHaveBeenCalledWith(user.id, "core-session-1");
    expect(mocks.setex).not.toHaveBeenCalled();
  });
});
