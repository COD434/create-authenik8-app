import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAuditEvents: vi.fn(),
  countAuditEvents: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/config/prisma.js", () => ({
  prisma: {
    auditEvent: {
      findMany: mocks.findAuditEvents,
      count: mocks.countAuditEvents,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../src/auth/authenik8.js", () => ({
  getAuthenik8: vi.fn(),
}));

import { listAuditEvents } from "../src/modules/admin/admin.service.js";

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
});
