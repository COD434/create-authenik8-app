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

async function registerCoreSession(
  user: User,
  tokens: { accessToken: string; refreshToken: string },
  req: Request,
) {
  const metadata = sessionMetadata(req);
  const accessToken = tokens.accessToken;
  const refreshToken = tokens.refreshToken;
  const accessPayload = await getAuthenik8().verifyToken(accessToken);
  if (!accessPayload?.sessionId || accessPayload.userId !== user.id) {
    throw new AppError(500, "SESSION_ISSUE_FAILED", "Unable to create an authenticated session");
  }

  try {
    await prisma.session.create({
      data: {
        userId: user.id,
        coreSessionId: accessPayload.sessionId,
        refreshHash: hashToken(refreshToken),
        ...metadata,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (error) {
    await getAuthenik8().revokeSession(user.id, accessPayload.sessionId).catch(() => undefined);
    throw error;
  }

  return { accessToken, refreshToken, user: presentUser(user) };
}

async function revokeIssuedCoreSession(userId: string, accessToken: string) {
  const payload = await getAuthenik8().verifyToken(accessToken).catch(() => null);
  if (payload?.userId === userId && payload.sessionId) {
    await getAuthenik8().revokeSession(userId, payload.sessionId).catch(() => undefined);
  }
}

export async function issueSession(user: User, req: Request) {
  const metadata = sessionMetadata(req);
  const tokens = await getAuthenik8().issueTokens(
    { userId: user.id, email: user.email, role: user.role },
    { device: metadata.userAgent, ip: metadata.ipAddress },
  );
  return registerCoreSession(user, tokens, req);
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
  const refreshHash = hashToken(refreshToken);
  const lockKey = `authenik8:refresh-lock:${refreshHash}`;
  const lockValue = randomToken();
  const acquired = await redis.set(lockKey, lockValue, "PX", 10_000, "NX");
  if (acquired !== "OK") {
    throw new AppError(409, "REFRESH_IN_PROGRESS", "Another session refresh is in progress");
  }
  let completed = false;
  try {
    const session = await prisma.session.findUnique({
      where: { refreshHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
      throw new AppError(401, "REFRESH_REJECTED", "Refresh session is invalid or expired");
    }

    const claimed = await prisma.session.updateMany({
      where: {
        id: session.id,
        refreshHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new AppError(401, "REFRESH_REJECTED", "Refresh session is invalid or expired");
    }

    let rotated: Awaited<ReturnType<ReturnType<typeof getAuthenik8>["refreshToken"]>>;
    try {
      rotated = await getAuthenik8().refreshToken(refreshToken);
    } catch {
      throw new AppError(401, "REFRESH_REJECTED", "Refresh session is invalid or expired");
    }
    if (!rotated.refreshToken) {
      throw new AppError(401, "REFRESH_REJECTED", "Refresh session is invalid or expired");
    }
    try {
      await prisma.session.update({
        where: { id: session.id },
        data: {
          refreshHash: hashToken(rotated.refreshToken),
          lastUsedAt: new Date(),
          revokedAt: null,
        },
      });
    } catch (error) {
      await getAuthenik8().revokeSession(session.userId, session.coreSessionId).catch(() => undefined);
      throw error;
    }
    completed = true;
    return { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken, user: presentUser(session.user) };
  } finally {
    if (!completed) {
      await redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        lockKey,
        lockValue,
      ).catch(() => undefined);
    }
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
  const now = new Date();
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!reset || reset.usedAt || reset.expiresAt <= now) {
    throw new AppError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or expired");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = await prisma.$transaction(async (transaction) => {
    const claim = await transaction.passwordResetToken.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return undefined;

    await transaction.user.update({
      where: { id: reset.userId },
      data: { passwordHash, passwordUpdatedAt: now },
    });
    await transaction.session.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return reset.userId;
  });
  if (!userId) {
    throw new AppError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or expired");
  }
  await getAuthenik8().revokeAllSessions(userId);
}

export async function verifyEmail(token: string) {
  const now = new Date();
  const verified = await prisma.$transaction(async (transaction) => {
    const verification = await transaction.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!verification || verification.usedAt || verification.expiresAt <= now) return false;

    const claim = await transaction.emailVerificationToken.updateMany({
      where: { id: verification.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return false;

    await transaction.user.update({
      where: { id: verification.userId },
      data: { emailVerifiedAt: now },
    });
    return true;
  });
  if (!verified) {
    throw new AppError(400, "VERIFICATION_INVALID", "This verification link is invalid or expired");
  }
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
  const userId = await redis.getdel(key);
  if (!userId) throw new AppError(400, "LINK_TICKET_INVALID", "Account-link request is invalid or expired");
  return userId;
}

export async function completeOAuthCallback(provider: OAuthProvider, result: Awaited<ReturnType<ReturnType<typeof oauthProvider>["provider"]["handleCallback"]>>, req: Request) {
  const profile = result.profile;
  if (profile.email_verified !== true) {
    throw new AppError(403, "OAUTH_EMAIL_UNVERIFIED", "OAuth provider email must be verified");
  }

  const identity = result.identity;
  if (!identity) {
    throw new AppError(500, "OAUTH_IDENTITY_MISSING", "OAuth identity resolution did not complete");
  }

  if (identity.type === "LINK_PROVIDER") {
    return { linked: true as const, provider };
  }

  if (identity.type === "LINK_REQUIRED" || identity.type === "EXISTING_EMAIL_CONFLICT") {
    throw new AppError(409, "OAUTH_LINK_REQUIRED", "Sign in to the existing account and link this provider from security settings");
  }
  if (identity.type === "INVALID_LINK_REQUEST") {
    throw new AppError(400, "OAUTH_LINK_INVALID", "This provider link request is invalid or expired");
  }
  if (
    (identity.type !== "EXISTING_PROVIDER_LOGIN" && identity.type !== "NEW_USER_CREATION")
    || !result.accessToken
    || !result.refreshToken
  ) {
    throw new AppError(500, "OAUTH_IDENTITY_INVALID", "OAuth identity resolution returned an invalid result");
  }

  const user = await prisma.user.findUnique({ where: { id: identity.user.id } });
  if (!user) {
    await revokeIssuedCoreSession(identity.user.id, result.accessToken);
    throw new AppError(500, "OAUTH_IDENTITY_INVALID", "OAuth identity is not available");
  }
  if (user.status !== "ACTIVE") {
    await revokeIssuedCoreSession(user.id, result.accessToken);
    throw new AppError(403, "ACCOUNT_SUSPENDED", "Account access is unavailable");
  }

  const session = await registerCoreSession(
    user,
    { accessToken: result.accessToken, refreshToken: result.refreshToken },
    req,
  );
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
  const value = await redis.getdel(key);
  if (!value) throw new AppError(400, "OAUTH_CODE_INVALID", "OAuth exchange is invalid or expired");
  const payload = openSealedValue(value, env.REFRESH_SECRET);
  if (!payload) throw new AppError(400, "OAUTH_CODE_INVALID", "OAuth exchange is invalid or expired");
  return oauthExchangeSessionSchema.parse(JSON.parse(payload));
}
