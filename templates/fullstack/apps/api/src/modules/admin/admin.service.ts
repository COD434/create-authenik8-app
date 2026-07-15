import { adminUserUpdateSchema } from "@authenik8/contracts";
import { prisma } from "../../config/prisma.js";
import { getAuthenik8 } from "../../auth/authenik8.js";
import { AppError } from "../../utils/http.js";
import { presentUser } from "../users/user.presenter.js";

export async function listUsers(page: number) {
  const pageSize = 20;
  const safePage = Math.max(1, page);
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip: (safePage - 1) * pageSize, take: pageSize }),
    prisma.user.count(),
  ]);
  return { items: items.map(presentUser), total, page: safePage, pageSize };
}

export async function updateUser(actorId: string, targetId: string, body: unknown, ipAddress: string) {
  const input = adminUserUpdateSchema.parse(body);
  if (actorId === targetId && (input.role === "USER" || input.status === "SUSPENDED")) {
    throw new AppError(400, "SELF_LOCKOUT", "You cannot remove your own administrator access");
  }
  const user = await prisma.user.update({ where: { id: targetId }, data: input });
  await prisma.auditEvent.create({
    data: { actorId, action: "admin.user.updated", targetType: "User", targetId, metadata: input, ipAddress },
  });
  if (input.status === "SUSPENDED") await revokeAllSessions(actorId, targetId, ipAddress, false);
  return presentUser(user);
}

export async function revokeAllSessions(actorId: string, targetId: string, ipAddress: string, audit = true) {
  await prisma.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
  await getAuthenik8().revokeAllSessions(targetId);
  if (audit) {
    await prisma.auditEvent.create({
      data: { actorId, action: "admin.sessions.revoked", targetType: "User", targetId, ipAddress },
    });
  }
}

export async function listAuditEvents() {
  const events = await prisma.auditEvent.findMany({
    include: { actor: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return events.map((event) => ({
    id: event.id,
    action: event.action,
    actorEmail: event.actor?.email ?? null,
    targetType: event.targetType,
    targetId: event.targetId,
    createdAt: event.createdAt.toISOString(),
  }));
}
