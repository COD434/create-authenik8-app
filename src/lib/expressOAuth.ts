import type { OAuthProvider } from "./oauth.js";

export const expressOAuthFiles = {
  auth: "src/auth/auth.ts",
  controller: "src/auth/controllers/oauth.controller.ts",
  routes: "src/auth/routes/oauth.routes.ts",
} as const;

export const expressOAuthSupportFiles = {
  linkIntent: "src/auth/oauth-link-intent.ts",
} as const;

export type ExpressOAuthFile =
  | (typeof expressOAuthFiles)[keyof typeof expressOAuthFiles]
  | (typeof expressOAuthSupportFiles)[keyof typeof expressOAuthSupportFiles];

function providerEnvBlock(provider: OAuthProvider): string {
  const upper = provider.toUpperCase();
  return `${provider}: {
        clientId: requiredEnv("${upper}_CLIENT_ID"),
        clientSecret: requiredEnv("${upper}_CLIENT_SECRET"),
        redirectUri: requiredEnv("${upper}_REDIRECT_URI"),
      },`;
}

function providerControllerBlock(provider: OAuthProvider): string {
  return `async ${provider}Redirect(req: Request, res: Response) {
    try {
      await requireProvider("${provider}", res)?.redirect(req, res);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: "OAuth redirect failed" });
    }
  },

  async ${provider}Callback(req: Request, res: Response) {
    try {
      const provider = requireProvider("${provider}", res);
      if (!provider) return;

      const result = await provider.handleCallback(req);

      if (
        result.identity?.type === "LINK_REQUIRED" ||
        result.identity?.type === "EXISTING_EMAIL_CONFLICT"
      ) {
        return res.status(409).json({ provider: "${provider}", ...result });
      }

      if (result.identity?.type === "INVALID_LINK_REQUEST") {
        return res.status(400).json({ provider: "${provider}", ...result });
      }

      if (result.mode === "login" && (!result.accessToken || !result.refreshToken)) {
        throw new Error("OAuth callback did not return an application session");
      }

      res.json({ provider: "${provider}", ...result });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "OAuth callback failed",
      });
    }
  },

  async ${provider}LinkIntent(req: Request, res: Response) {
    await issueProviderLinkIntent("${provider}", req, res);
  },

  async ${provider}Link(req: Request, res: Response) {
    await redirectProviderLink("${provider}", req, res);
  },`;
}

function providerRoutesBlock(provider: OAuthProvider): string {
  return `router.get("/${provider}", oauthController.${provider}Redirect);
router.get("/${provider}/callback", oauthController.${provider}Callback);
router.post("/${provider}/link-intent", authMiddleware, oauthController.${provider}LinkIntent);
router.get("/${provider}/link", oauthController.${provider}Link);`;
}

/** Canonical OAuth source shared by generation and guarded add recipes. */
export function renderExpressOAuthFiles(
  providers: readonly OAuthProvider[],
): Record<ExpressOAuthFile, string> {
  const providerUnion = providers.map((provider) => `"${provider}"`).join(" | ");

  return {
    [expressOAuthFiles.auth]: `import { createAuthenik8 } from "authenik8-core";
import type { Authenik8Instance } from "authenik8-core";
import dotenv  from "dotenv";
import { createRedisClient } from "../config/redis";
import { agentIdentityConfig, authJwkConfig, requiredEnv, requiredSecret } from "../utils/security";
import { identityAdapter } from "./identity.adapter";

dotenv.config();

let authInstance: Authenik8Instance | undefined;

function oauthConfig() {
  return {
    ${providers.map(providerEnvBlock).join("\n    ")}
  };
}

export async function initAuth() {
  authInstance= await createAuthenik8({
    jwt: authJwkConfig(),
    refreshSecret: requiredSecret("REFRESH_SECRET"),
    agent: agentIdentityConfig(),
    redis: await createRedisClient(),
    oauth: oauthConfig(),
    identityAdapter,
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
) as Authenik8Instance;
`,
    [expressOAuthFiles.routes]: `import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { oauthController } from "../controllers/oauth.controller";

const router = express.Router();

${providers.map(providerRoutesBlock).join("\n")}

export default router;
`,
    [expressOAuthFiles.controller]: `import { Request, Response } from "express";
import { getAuth } from "../auth";
import {
  consumeOAuthLinkIntent,
  createOAuthLinkIntent,
  OAuthLinkIntentError,
  oauthLinkIntentTtlSeconds,
} from "../oauth-link-intent";

type OAuthProvider = ${providerUnion};
type AuthenticatedRequest = Request & { user?: { userId?: unknown } };

function requireProvider(provider: OAuthProvider, res: Response) {
  const oauthProvider = getAuth().oauth?.[provider];

  if (!oauthProvider) {
    res.status(404).json({ error: \`\${provider} OAuth is not configured\` });
    return undefined;
  }

  return oauthProvider;
}

function requireAuthenticatedUserId(req: Request, res: Response): string | undefined {
  const userId = (req as AuthenticatedRequest).user?.userId;
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    userId.length > 256 ||
    /[\\u0000-\\u001f\\u007f]/.test(userId)
  ) {
    res.status(401).json({ error: "Authenticated user is required to link a provider" });
    return undefined;
  }
  return userId;
}

function requireLinkIntentStore(res: Response) {
  const redis = getAuth().redisclient;
  if (!redis) {
    res.status(503).json({ error: "OAuth account linking is temporarily unavailable" });
    return undefined;
  }
  return redis;
}

async function issueProviderLinkIntent(
  provider: OAuthProvider,
  req: Request,
  res: Response,
) {
  if (!requireProvider(provider, res)) return;
  const userId = requireAuthenticatedUserId(req, res);
  if (!userId) return;
  const redis = requireLinkIntentStore(res);
  if (!redis) return;

  try {
    const ticket = await createOAuthLinkIntent(redis, provider, userId);
    res.status(201).json({
      url: \`/auth/\${provider}/link?ticket=\${encodeURIComponent(ticket)}\`,
      expiresIn: oauthLinkIntentTtlSeconds,
    });
  } catch {
    res.status(503).json({ error: "OAuth account linking is temporarily unavailable" });
  }
}

async function redirectProviderLink(
  provider: OAuthProvider,
  req: Request,
  res: Response,
) {
  const oauthProvider = requireProvider(provider, res);
  if (!oauthProvider) return;
  const redis = requireLinkIntentStore(res);
  if (!redis) return;

  let userId: string;
  try {
    userId = await consumeOAuthLinkIntent(redis, provider, req.query.ticket);
  } catch (error) {
    if (error instanceof OAuthLinkIntentError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(503).json({ error: "OAuth account linking is temporarily unavailable" });
    }
    return;
  }

  (req as AuthenticatedRequest).user = { userId };
  try {
    await oauthProvider.redirect(req, res, "link");
  } catch {
    if (!res.headersSent) res.status(500).json({ error: "OAuth link redirect failed" });
  }
}

export const oauthController = {
  ${providers.map(providerControllerBlock).join("\n\n  ")}
};
`,
    [expressOAuthSupportFiles.linkIntent]: `import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

export const oauthLinkIntentTtlSeconds = 120;

const ticketPattern = /^[A-Za-z0-9_-]{43}$/;
const providerPattern = /^[a-z][a-z0-9-]{0,31}$/;
const keyPrefix = "authenik8:app:oauth-link";

type LinkIntentRedis = Pick<Redis, "getdel" | "set">;

export class OAuthLinkIntentError extends Error {
  constructor() {
    super("OAuth link request is invalid or expired");
    this.name = "OAuthLinkIntentError";
  }
}

function intentKey(provider: string, ticket: string): string {
  if (!providerPattern.test(provider) || !ticketPattern.test(ticket)) {
    throw new OAuthLinkIntentError();
  }
  return \`\${keyPrefix}:\${provider}:\${ticket}\`;
}

function validUserId(userId: string): boolean {
  return userId.length > 0 &&
    userId.length <= 256 &&
    !/[\\u0000-\\u001f\\u007f]/.test(userId);
}

export async function createOAuthLinkIntent(
  redis: LinkIntentRedis,
  provider: string,
  userId: string,
): Promise<string> {
  if (!providerPattern.test(provider) || !validUserId(userId)) {
    throw new OAuthLinkIntentError();
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ticket = randomBytes(32).toString("base64url");
    const stored = await redis.set(
      intentKey(provider, ticket),
      userId,
      "EX",
      oauthLinkIntentTtlSeconds,
      "NX",
    );
    if (stored === "OK") return ticket;
  }

  throw new Error("Unable to allocate an OAuth link ticket");
}

export async function consumeOAuthLinkIntent(
  redis: LinkIntentRedis,
  provider: string,
  ticket: unknown,
): Promise<string> {
  if (typeof ticket !== "string") throw new OAuthLinkIntentError();
  const userId = await redis.getdel(intentKey(provider, ticket));
  if (!userId || !validUserId(userId)) throw new OAuthLinkIntentError();
  return userId;
}
`,
  };
}
