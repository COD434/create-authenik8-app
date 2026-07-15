import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { csrfTokenSchema } from "@authenik8/contracts";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { env } from "../config/env.js";

export const csrfCookieName = "authenik8_csrf";

function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: 2 * 60 * 60 * 1000,
  };
}

function signature(nonce: string): string {
  return createHmac("sha256", env.REFRESH_SECRET)
    .update("authenik8:csrf:v1:")
    .update(nonce)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthenticToken(value: unknown): value is string {
  const parsed = csrfTokenSchema.safeParse(value);
  if (!parsed.success) return false;
  const [nonce, providedSignature] = parsed.data.split(".");
  return safeEqual(providedSignature!, signature(nonce!));
}

export function issueCsrfToken(req: Request, res: Response): string {
  const existingToken = req.cookies?.authenik8_csrf;
  if (isAuthenticToken(existingToken)) return existingToken;

  const nonce = randomBytes(32).toString("base64url");
  const token = csrfTokenSchema.parse(`${nonce}.${signature(nonce)}`);
  res.cookie(csrfCookieName, token, csrfCookieOptions());
  return token;
}

export const requireCsrf: RequestHandler = (req, res, next) => {
  const cookieToken = req.cookies?.authenik8_csrf;
  const headerToken = req.get("x-csrf-token");
  if (isAuthenticToken(cookieToken) && csrfTokenSchema.safeParse(headerToken).success && safeEqual(cookieToken, headerToken!)) {
    next();
    return;
  }

  res.status(403).json({
    error: { code: "CSRF_REJECTED", message: "Request verification failed" },
    requestId: req.id,
  });
};
