import { createAuthenik8 } from "authenik8-core";
import dotenv  from "dotenv";
import { requiredEnv, requiredSecret } from "../utils/security";

dotenv.config();

let authInstance: any;

function enabledOAuthProviders() {
  const configured = process.env.AUTHENIK8_OAUTH_PROVIDERS;
  if (!configured || configured.trim().length === 0) {
    return new Set(["google", "github"]);
  }

  return new Set(
    configured
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  );
}

function oauthConfig() {
  const enabled = enabledOAuthProviders();
  const oauth: Record<string, unknown> = {};

  if (enabled.has("google")) {
    oauth.google = {
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
    };
  }

  if (enabled.has("github")) {
    oauth.github = {
      clientId: requiredEnv("GITHUB_CLIENT_ID"),
      clientSecret: requiredEnv("GITHUB_CLIENT_SECRET"),
      redirectUri: requiredEnv("GITHUB_REDIRECT_URI"),
    };
  }

  return oauth;
}



export async function initAuth() {
  authInstance= await createAuthenik8({
    jwtSecret: requiredSecret("JWT_SECRET"),
    refreshSecret: requiredSecret("REFRESH_SECRET"),
    oauth: oauthConfig(),
  });

}
export function getAuth() {
  if (!authInstance) {
    throw new Error("Auth not initialized. Call initAuth() first.");
  }

  return authInstance;
}

export const auth = new Proxy(
  {},
  {
    get(_target, property) {
      return getAuth()[property as keyof ReturnType<typeof getAuth>];
    },
  },
) as any;
