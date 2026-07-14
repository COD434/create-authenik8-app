import { createAuthenik8 } from "authenik8-core";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

type AuthInstance = Awaited<ReturnType<typeof createAuthenik8>>;
let instance: AuthInstance | undefined;

function oauthConfig() {
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI } }
      : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_REDIRECT_URI
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, redirectUri: env.GITHUB_REDIRECT_URI } }
      : {}),
  };
}

export async function initAuthenik8(): Promise<AuthInstance> {
  if (instance) return instance;
  const oauth = oauthConfig();
  instance = await createAuthenik8({
    jwtSecret: env.JWT_SECRET,
    refreshSecret: env.REFRESH_SECRET,
    jwtExpiry: "15m",
    redis,
    oauth: Object.keys(oauth).length ? oauth : undefined,
    trustProxyHeaders: env.TRUST_PROXY,
  });
  return instance;
}

export function getAuthenik8(): AuthInstance {
  if (!instance) throw new Error("Authenik8 has not been initialized");
  return instance;
}
