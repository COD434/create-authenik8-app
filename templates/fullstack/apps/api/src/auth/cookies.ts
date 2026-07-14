import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";

export const refreshCookieName = "authenik8_refresh";

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(refreshCookieName, token, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(refreshCookieName, options);
}
