import { env } from "./env.js";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function toUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (origin === env.WEB_ORIGIN) return true;
  if (env.NODE_ENV === "production") return false;

  const configured = toUrl(env.WEB_ORIGIN);
  const candidate = toUrl(origin);
  return Boolean(
    configured
    && candidate
    && configured.protocol === candidate.protocol
    && loopbackHosts.has(configured.hostname)
    && loopbackHosts.has(candidate.hostname),
  );
}
