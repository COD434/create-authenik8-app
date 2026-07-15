import bcrypt from "bcryptjs";
import type { Request } from "express";
import { changePasswordSchema, profileSchema } from "@authenik8/contracts";
import { readRefreshCookie } from "../../auth/cookies.js";
import { prisma } from "../../config/prisma.js";
import { getAuthenik8 } from "../../auth/authenik8.js";
import { hashToken } from "../../utils/crypto.js";
import { AppError } from "../../utils/http.js";
import { presentUser } from "./user.presenter.js";

export async function updateProfile(userId: string, body: unknown) {
  const input = profileSchema.parse(body);
  return presentUser(await prisma.user.update({ where: { id: userId }, data: { name: input.name } }));
}

export async function changePassword(userId: string, body: unknown) {
  const input = changePasswordSchema.parse(body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, "PASSWORD_INCORRECT", "Current password is incorrect");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 12), passwordUpdatedAt: now },
    }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  await getAuthenik8().revokeAllSessions(userId);
}

export async function listSessions(userId: string, req: Request) {
  const refreshToken = readRefreshCookie(req);
  const currentHash = refreshToken ? hashToken(refreshToken) : "";
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.refreshHash === currentHash,
  }));
}

export async function revokeSession(userId: string, sessionId: string, req: Request) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
  if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Session not found");
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  const refreshToken = readRefreshCookie(req);
  const current = refreshToken && session.refreshHash === hashToken(refreshToken);
  await getAuthenik8().revokeSession(userId, session.coreSessionId);
  return Boolean(current);
}

export async function listProviders(userId: string) {
  const providers = await prisma.oAuthAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return providers.map((account) => ({
    provider: account.provider as "google" | "github",
    providerEmail: account.providerEmail,
    linkedAt: account.createdAt.toISOString(),
  }));
}
