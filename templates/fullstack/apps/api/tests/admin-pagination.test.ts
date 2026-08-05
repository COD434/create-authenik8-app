import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAuditEvents: vi.fn(),
  countAuditEvents: vi.fn(),
  transaction: vi.fn(),

  findUser: vi.fn(),


}));

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    auditEvent: {
      findMany: mocks.findAuditEvents,
      count: mocks.countAuditEvents,
    },

    user: { findUnique: mocks.findUser },

    $transaction: mocks.transaction,
  },
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: vi.fn(),
}));


import { getUser, listAuditEvents } from "../src/modules/admin/admin.service.js";


describe("admin pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((operations) => Promise.all(operations));
    mocks.countAuditEvents.mockResolvedValue(75);
    mocks.findAuditEvents.mockResolvedValue([{
      id: "event-1",
      action: "admin.user.updated",
      actor: { email: "admin@example.com" },
      targetType: "User",
      targetId: "user-1",
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
    }]);
  });

  it("returns a bounded audit page instead of silently truncating the collection", async () => {
    await expect(listAuditEvents(2)).resolves.toEqual({
      items: [{
        id: "event-1",
        action: "admin.user.updated",
        actorEmail: "admin@example.com",
        targetType: "User",
        targetId: "user-1",
        createdAt: "2026-01-02T03:04:05.000Z",
      }],
      total: 75,
      page: 2,
      pageSize: 50,
    });
    expect(mocks.findAuditEvents).toHaveBeenCalledWith(expect.objectContaining({
      skip: 50,
      take: 50,
    }));
  });


  it("returns one public user projection for administrator detail views", async () => {
    mocks.findUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      name: "User",
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(getUser("11111111-1111-4111-8111-111111111111")).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      name: "User",
      role: "USER",
      status: "ACTIVE",
      verified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

});
