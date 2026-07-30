import bcrypt from "bcryptjs";
import type { Request } from "express";
import { changePasswordSchema, oauthProviderSchema, profileSchema } from "@authenik8/contracts";
import { readRefreshCookie } from "../../auth/cookies.js";
import { prisma } from "../../config/prisma.js";
import { getAuthenik8 } from "../../auth/authenik8.js";
import { hashToken } from "../../utils/crypto.js";
import { AppError } from "../../utils/http.js";
import { presentUser } from "./user.presenter.js";

export async function getProfile(userId: string) {
  return presentUser(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
}

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

export async function revokeOtherSessions(userId: string, req: Request) {
  const refreshToken = readRefreshCookie(req);
  if (!refreshToken) {
    throw new AppError(400, "CURRENT_SESSION_REQUIRED", "The current refresh session is required");
  }
  const current = await prisma.session.findFirst({
    where: {
      userId,
      refreshHash: hashToken(refreshToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!current) {
    throw new AppError(400, "CURRENT_SESSION_REQUIRED", "The current refresh session is not active");
  }

  const others = await prisma.session.findMany({
    where: { userId, id: { not: current.id }, revokedAt: null },
    select: { id: true, coreSessionId: true },
  });
  if (!others.length) return 0;

  await prisma.session.updateMany({
    where: { id: { in: others.map((session) => session.id) }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await Promise.all(
    others.map((session) => getAuthenik8().revokeSession(userId, session.coreSessionId)),
  );
  return others.length;
}

export async function listProviders(userId: string) {
  const providers = await prisma.oAuthAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return providers.map((account) => ({
    provider: account.provider as "google" | "github",
    providerEmail: account.providerEmail,
    linkedAt: account.createdAt.toISOString(),
  }));
}

export async function unlinkProvider(userId: string, providerInput: unknown) {
  const provider = oauthProviderSchema.parse(providerInput);
  await prisma.$transaction(async (transaction) => {
    // Serialize provider removal for this identity so two concurrent unlinks
    // cannot both observe another provider and remove the final login method.
    await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await transaction.user.findUnique({
      where: { id: userId },
      include: { oauthAccounts: { select: { provider: true } } },
    });
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    if (!user.passwordHash && user.oauthAccounts.length <= 1) {
      throw new AppError(400, "LAST_AUTH_METHOD", "Add a password or another provider before unlinking this account");
    }

    const removed = await transaction.oAuthAccount.deleteMany({ where: { userId, provider } });
    if (removed.count !== 1) {
      throw new AppError(404, "PROVIDER_NOT_LINKED", "Provider is not linked");
    }
  });
}
