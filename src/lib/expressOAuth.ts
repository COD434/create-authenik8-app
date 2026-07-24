import type { OAuthProvider } from "./oauth.js";

export const expressOAuthFiles = {
  auth: "src/auth/auth.ts",
  controller: "src/auth/controllers/oauth.controller.ts",
  routes: "src/auth/routes/oauth.routes.ts",
} as const;

export type ExpressOAuthFile = (typeof expressOAuthFiles)[keyof typeof expressOAuthFiles];

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
      let response = result;

      if (result.mode === "link" && !result.identity) {
        if (!result.userId) {
          return res.status(400).json({ error: "Authenticated user is required to link a provider" });
        }

        await identityAdapter.linkProvider(
          result.userId,
          result.profile.provider,
          result.profile.providerId,
        );
        response = {
          ...result,
          identity: { type: "LINK_PROVIDER", success: true },
        };
      }

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

      res.json({ provider: "${provider}", ...response });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "OAuth callback failed",
      });
    }
  },

  async ${provider}Link(req: Request, res: Response) {
    try {
      await requireProvider("${provider}", res)?.redirect(req, res, "link");
    } catch {
      if (!res.headersSent) res.status(500).json({ error: "OAuth link redirect failed" });
    }
  },`;
}

function providerRoutesBlock(provider: OAuthProvider): string {
  return `router.get("/${provider}", oauthController.${provider}Redirect);
router.get("/${provider}/callback", oauthController.${provider}Callback);
router.get("/${provider}/link", authMiddleware, oauthController.${provider}Link);`;
}

/** Canonical OAuth source shared by generation and guarded add recipes. */
export function renderExpressOAuthFiles(
  providers: readonly OAuthProvider[],
): Record<ExpressOAuthFile, string> {
  const providerUnion = providers.map((provider) => `"${provider}"`).join(" | ");

  return {
    [expressOAuthFiles.auth]: `import { createAuthenik8 } from "authenik8-core";
import dotenv  from "dotenv";
import { createRedisClient } from "../config/redis";
import { agentIdentityConfig, authJwkConfig, requiredEnv, requiredSecret } from "../utils/security";
import { identityAdapter } from "./identity.adapter";

dotenv.config();

let authInstance: any;

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
) as any;
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
import { identityAdapter } from "../identity.adapter";

type OAuthProvider = ${providerUnion};

function requireProvider(provider: OAuthProvider, res: Response) {
  const oauthProvider = getAuth().oauth?.[provider];

  if (!oauthProvider) {
    res.status(404).json({ error: \`\${provider} OAuth is not configured\` });
    return undefined;
  }

  return oauthProvider;
}

export const oauthController = {
  ${providers.map(providerControllerBlock).join("\n\n  ")}
};
`,
  };
}
