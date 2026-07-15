import type { CookieOptions, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { openSealedValue, sealValue } from "../utils/sealed-value.js";

export const refreshCookieName = "authenik8_refresh";
const refreshTokenSchema = z.string().min(1).max(4096);

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, token: string) {
  const sealedToken = sealValue(refreshTokenSchema.parse(token), env.REFRESH_SECRET);
  // The bearer token is AES-256-GCM encrypted before it reaches cookie storage.
  // codeql[js/clear-text-storage-of-sensitive-data]
  res.cookie(refreshCookieName, sealedToken, refreshCookieOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const sealedToken = req.cookies?.[refreshCookieName];
  const token = openSealedValue(sealedToken, env.REFRESH_SECRET);
  const result = refreshTokenSchema.safeParse(token);
  return result.success ? result.data : undefined;
}

export function clearRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(refreshCookieName, options);
}
