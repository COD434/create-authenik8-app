import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readRefreshCookie: vi.fn(),
  findSession: vi.fn(),
  findSessions: vi.fn(),
  updateSessions: vi.fn(),
  findUser: vi.fn(),
  deleteAccounts: vi.fn(),
  revokeSession: vi.fn(),
  transaction: vi.fn(),
  lockUser: vi.fn(),
}));

vi.mock("../src/auth/cookies.js", () => ({
  readRefreshCookie: mocks.readRefreshCookie,
}));
vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    session: {
      findFirst: mocks.findSession,
      findMany: mocks.findSessions,
      updateMany: mocks.updateSessions,
    },
    user: { findUnique: mocks.findUser },
    oAuthAccount: { deleteMany: mocks.deleteAccounts },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: () => ({ revokeSession: mocks.revokeSession }),
}));

import { revokeOtherSessions, unlinkProvider } from "../src/modules/users/user.service.js";
import { hashToken } from "../src/utils/crypto.js";

describe("account session and provider operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRefreshCookie.mockReturnValue("current-refresh-token");
    mocks.findSession.mockResolvedValue({
      id: "session-current",
      refreshHash: hashToken("current-refresh-token"),
    });
    mocks.findSessions.mockResolvedValue([
      { id: "session-other-1", coreSessionId: "core-other-1" },
      { id: "session-other-2", coreSessionId: "core-other-2" },
    ]);
    mocks.updateSessions.mockResolvedValue({ count: 2 });
    mocks.revokeSession.mockResolvedValue(undefined);
    mocks.deleteAccounts.mockResolvedValue({ count: 1 });
    mocks.lockUser.mockResolvedValue([{ id: "user-1" }]);
    mocks.transaction.mockImplementation((operation) => operation({
      $queryRaw: mocks.lockUser,
      user: { findUnique: mocks.findUser },
      oAuthAccount: { deleteMany: mocks.deleteAccounts },
    }));
  });

  it("revokes every other database and core session but preserves the current one", async () => {
    await expect(revokeOtherSessions("user-1", {} as never)).resolves.toBe(2);
    expect(mocks.findSession).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "user-1",
        refreshHash: hashToken("current-refresh-token"),
        revokedAt: null,
      }),
    });
    expect(mocks.updateSessions).toHaveBeenCalledWith({
      where: { id: { in: ["session-other-1", "session-other-2"] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.revokeSession).toHaveBeenCalledTimes(2);
    expect(mocks.revokeSession).not.toHaveBeenCalledWith("user-1", "session-current");
  });

  it("requires an active current refresh session before revoking others", async () => {
    mocks.readRefreshCookie.mockReturnValue(undefined);

    await expect(revokeOtherSessions("user-1", {} as never)).rejects.toMatchObject({
      status: 400,
      code: "CURRENT_SESSION_REQUIRED",
    });
    expect(mocks.updateSessions).not.toHaveBeenCalled();
  });

  it("prevents unlinking the final authentication method", async () => {
    mocks.findUser.mockResolvedValue({
      passwordHash: null,
      oauthAccounts: [{ provider: "github" }],
    });

    await expect(unlinkProvider("user-1", "github")).rejects.toMatchObject({
      status: 400,
      code: "LAST_AUTH_METHOD",
    });
    expect(mocks.deleteAccounts).not.toHaveBeenCalled();
  });

  it("unlinks a provider when another sign-in method remains", async () => {
    mocks.findUser.mockResolvedValue({
      passwordHash: "password-hash",
      oauthAccounts: [{ provider: "github" }],
    });

    await expect(unlinkProvider("user-1", "github")).resolves.toBeUndefined();
    expect(mocks.deleteAccounts).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "github" },
    });
  });
});
