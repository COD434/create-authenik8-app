import { env } from "./env.js";

export function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === env.WEB_ORIGIN;
}
