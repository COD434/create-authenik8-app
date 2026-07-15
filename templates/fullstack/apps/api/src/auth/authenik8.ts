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
  const signingKeys = JSON.parse(env.AUTHENIK8_SIGNING_JWKS) as Array<{
    kid: string;
    d?: string;
    [key: string]: unknown;
  }>;
  const activeKey = signingKeys.find((key) => key.kid === env.AUTHENIK8_ACTIVE_KID);
  if (!activeKey?.d) {
    throw new Error("AUTHENIK8_ACTIVE_KID must select a private signing JWK");
  }
  const agentRegistry = JSON.parse(env.AUTHENIK8_AGENTS) as Record<string, string[]>;
  const agent = Object.keys(agentRegistry).length
    ? {
        resolveAgent: async (agentId: string) => {
          const scopes = Object.prototype.hasOwnProperty.call(agentRegistry, agentId)
            ? agentRegistry[agentId]
            : undefined;
          return scopes ? { agentId, scopes, active: true } : null;
        },
      }
    : undefined;
  instance = await createAuthenik8({
    jwt: {
      keys: signingKeys,
      activeKid: env.AUTHENIK8_ACTIVE_KID,
      issuer: env.AUTHENIK8_ISSUER,
      audience: env.AUTHENIK8_AUDIENCE,
    },
    refreshSecret: env.REFRESH_SECRET,
    agent,
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
