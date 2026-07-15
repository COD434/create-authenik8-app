import bcrypt from "bcryptjs";
import type { Request } from "express";
import type { User } from "@prisma/client";
import { z } from "zod";
import type { OAuthProvider, RegisterInput } from "@authenik8/contracts";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/http.js";
import { hashToken, randomToken } from "../utils/crypto.js";
import { openSealedValue, sealValue } from "../utils/sealed-value.js";
import { getAuthenik8, redis } from "./authenik8.js";
import { presentUser } from "../modules/users/user.presenter.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../config/mailer.js";

const genericCredentials = new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
const requestMetadataSchema = z.object({
  userAgent: z.string().trim().min(1).max(300),
  ipAddress: z.string().trim().min(1).max(64),
});
const oauthExchangeSessionSchema = z.strictObject({
  accessToken: z.string().min(1).max(8192),
  refreshToken: z.string().min(1).max(4096),
  user: z.strictObject({
    id: z.string().uuid(),
    email: z.string().email().max(254),
    name: z.string().min(1).max(80),
    role: z.enum(["USER", "ADMIN"]),
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    verified: z.boolean(),
    createdAt: z.string().datetime(),
  }),
});

function sessionMetadata(req: Request) {
  return requestMetadataSchema.parse({
    userAgent: (req.get("user-agent") ?? "Unknown device").slice(0, 300),
    ipAddress: (req.ip ?? "unknown").slice(0, 64),
  });
}

export async function issueSession(user: User, req: Request) {
  const tokens = await getAuthenik8().issueTokens({ userId: user.id, email: user.email, role: user.role });
  const accessToken = await tokens.accessToken;
  const refreshToken = tokens.refreshToken;
  const accessPayload = await getAuthenik8().verifyToken(accessToken);
  if (!accessPayload?.sessionId) {
    throw new AppError(500, "SESSION_ISSUE_FAILED", "Unable to create an authenticated session");
  }

  await prisma.session.create({
    data: {
      userId: user.id,
      coreSessionId: accessPayload.sessionId,
      refreshHash: hashToken(refreshToken),
      ...sessionMetadata(req),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken, user: presentUser(user) };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { message: "Check your inbox to continue" };

  const rawToken = randomToken();
  await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 12),
      verificationTokens: {
        create: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
    },
  });
  await sendVerificationEmail(input.email, rawToken);

  return {
    message: "Check your inbox to continue",
    ...(env.NODE_ENV === "development" ? { devVerificationToken: rawToken } : {}),
  };
}

export async function login(input: { email: string; password: string }, req: Request) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user?.passwordHash || user.status !== "ACTIVE") throw genericCredentials;
  if (!(await bcrypt.compare(input.password, user.passwordHash))) throw genericCredentials;
  return issueSession(user, req);
}

export async function rotateSession(refreshToken: string | undefined) {
  if (!refreshToken) throw new AppError(401, "REFRESH_REQUIRED", "Refresh session is missing");
  const session = await prisma.session.findUnique({
    where: { refreshHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    throw new AppError(401, "REFRESH_REJECTED", "Refresh session is invalid or expired");
  }

  try {
    const rotated = await getAuthenik8().refreshToken(refreshToken);
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshHash: hashToken(rotated.refreshToken), lastUsedAt: new Date() },
    });
    return { accessToken: rotated.accessToken as string, refreshToken: rotated.refreshToken as string, user: presentUser(session.user) };
  } catch {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw new AppError(401, "REFRESH_REJECTED", "Refresh session is invalid or expired");
  }
}

export async function revokeRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken) return;
  const session = await prisma.session.findUnique({ where: { refreshHash: hashToken(refreshToken) } });
  if (!session) return;
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await getAuthenik8().revokeSession(session.userId, session.coreSessionId);
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return { message: "If that account exists, a reset link has been sent" };

  const rawToken = randomToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  await sendPasswordResetEmail(user.email, rawToken);
  return {
    message: "If that account exists, a reset link has been sent",
    ...(env.NODE_ENV === "development" ? { devResetToken: rawToken } : {}),
  };
}

export async function resetPassword(token: string, password: string) {
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
    throw new AppError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or expired");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: now } }),
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(password, 12), passwordUpdatedAt: now } }),
    prisma.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await getAuthenik8().revokeAllSessions(reset.userId);
}

export async function verifyEmail(token: string) {
  const verification = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!verification || verification.usedAt || verification.expiresAt <= new Date()) {
    throw new AppError(400, "VERIFICATION_INVALID", "This verification link is invalid or expired");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: verification.id }, data: { usedAt: now } }),
    prisma.user.update({ where: { id: verification.userId }, data: { emailVerifiedAt: now } }),
  ]);
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { message: "Email is already verified" };
  const rawToken = randomToken();
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  await sendVerificationEmail(user.email, rawToken);
  return {
    message: "Verification email sent",
    ...(env.NODE_ENV === "development" ? { devVerificationToken: rawToken } : {}),
  };
}

export function oauthProvider(name: OAuthProvider) {
  const provider = getAuthenik8().oauth?.[name];
  if (!provider) throw new AppError(404, "PROVIDER_NOT_CONFIGURED", "OAuth provider is not configured");
  return { name, provider };
}

export async function createLinkIntent(userId: string, provider: OAuthProvider) {
  oauthProvider(provider);
  const ticket = randomToken();
  await redis.setex(`oauth:link:${ticket}`, 120, userId);
  return `/api/auth/oauth/${provider}/link?ticket=${ticket}`;
}

export async function consumeLinkIntent(ticket: string | undefined) {
  if (!ticket) throw new AppError(400, "LINK_TICKET_INVALID", "Account-link request is missing");
  const key = `oauth:link:${ticket}`;
  const userId = await redis.get(key);
  if (!userId) throw new AppError(400, "LINK_TICKET_INVALID", "Account-link request is invalid or expired");
  await redis.del(key);
  return userId;
}

export async function completeOAuthCallback(provider: OAuthProvider, result: Awaited<ReturnType<ReturnType<typeof oauthProvider>["provider"]["handleCallback"]>>, req: Request) {
  const profile = result.profile;
  if (profile.email_verified !== true && profile.email_verified !== "true") {
    throw new AppError(403, "OAUTH_EMAIL_UNVERIFIED", "OAuth provider email must be verified");
  }

  if (result.mode === "link" && result.userId) {
    const claimed = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerId } },
    });
    if (claimed && claimed.userId !== result.userId) throw new AppError(409, "PROVIDER_ALREADY_LINKED", "Provider account is linked to another user");
    await prisma.oAuthAccount.upsert({
      where: { userId_provider: { userId: result.userId, provider } },
      update: { providerAccountId: profile.providerId, providerEmail: profile.email },
      create: { userId: result.userId, provider, providerAccountId: profile.providerId, providerEmail: profile.email },
    });
    return { linked: true as const, provider };
  }

  const account = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: profile.providerId } },
    include: { user: true },
  });
  let user = account?.user;
  if (!user) {
    user = await prisma.user.upsert({
      where: { email: profile.email.toLowerCase() },
      update: { emailVerifiedAt: new Date() },
      create: { email: profile.email.toLowerCase(), name: profile.name ?? "New user", emailVerifiedAt: new Date() },
    });
    await prisma.oAuthAccount.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      update: { providerAccountId: profile.providerId, providerEmail: profile.email },
      create: { userId: user.id, provider, providerAccountId: profile.providerId, providerEmail: profile.email },
    });
  }
  if (user.status !== "ACTIVE") throw new AppError(403, "ACCOUNT_SUSPENDED", "Account access is unavailable");

  const session = await issueSession(user, req);
  const code = randomToken();
  await redis.setex(
    `oauth:exchange:${code}`,
    60,
    sealValue(JSON.stringify(session), env.REFRESH_SECRET),
  );
  return { linked: false as const, code };
}

export async function exchangeOAuthCode(code: string) {
  const key = `oauth:exchange:${code}`;
  const value = await redis.get(key);
  if (!value) throw new AppError(400, "OAUTH_CODE_INVALID", "OAuth exchange is invalid or expired");
  await redis.del(key);
  const payload = openSealedValue(value, env.REFRESH_SECRET);
  if (!payload) throw new AppError(400, "OAUTH_CODE_INVALID", "OAuth exchange is invalid or expired");
  return oauthExchangeSessionSchema.parse(JSON.parse(payload));
}
