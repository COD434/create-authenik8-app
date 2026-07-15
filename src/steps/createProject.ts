import fs from "fs-extra";
import path from "path";
import { randomUUID } from "node:crypto";
import type { CliState } from "../lib/types.js";
import type { PackageManager } from "../lib/types.js";
import { PRISMA_VERSION } from "../lib/constants.js";

const supportedOAuthProviders = ["google", "github"] as const;
type OAuthProvider = (typeof supportedOAuthProviders)[number];

export function resolveTemplateName(authMode: string): string {
  if (authMode === "fullstack") return "fullstack";
  if (authMode === "auth") return "express-auth";
  if (authMode === "auth-oauth") return "express-auth+";
  return "express-base";
}

export function configurePackageJson(
  targetDir: string,
  usePrisma: boolean,
  packageManager: PackageManager = "npm",
): void {
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (Array.isArray(pkg.workspaces)) return;

  pkg.scripts ??= {};

  if (usePrisma) {
    if (!pkg.scripts.postinstall?.includes("prisma")) {
      pkg.scripts.postinstall = "prisma generate";
    }

    const currentDev = pkg.scripts.dev || "tsx watch src/index.ts";
    if (!currentDev.includes("prisma generate")) {
      pkg.scripts.dev = `prisma generate && ${currentDev}`;
    }

    if (packageManager === "bun") {
      pkg.trustedDependencies = ["@prisma/engines", "better-sqlite3", "prisma"];
    }

    if (packageManager === "pnpm") {
      fs.writeFileSync(
        path.join(targetDir, "pnpm-workspace.yaml"),
        [
          "allowBuilds:",
          '  "@prisma/engines": true',
          "  better-sqlite3: true",
          "  prisma: true",
          "overrides:",
          '  "@hono/node-server": "1.19.13"',
          "",
        ].join("\n"),
      );
    }

    if (packageManager === "npm") {
      pkg.allowScripts = {
        [`prisma@${PRISMA_VERSION}`]: true,
        [`@prisma/engines@${PRISMA_VERSION}`]: true,
        ...(pkg.dependencies?.["@prisma/adapter-better-sqlite3"]
          ? { "better-sqlite3": true }
          : {}),
      };
    }
  } else {
    for (const scriptName of ["postinstall", "prisma:generate", "prisma:migrate"]) {
      if (pkg.scripts[scriptName]?.includes("prisma")) {
        delete pkg.scripts[scriptName];
      }
    }

    delete pkg.dependencies?.["@prisma/client"];
    delete pkg.dependencies?.["@prisma/adapter-pg"];
    delete pkg.dependencies?.["@prisma/adapter-better-sqlite3"];
    delete pkg.devDependencies?.prisma;
    delete pkg.trustedDependencies;
    delete pkg.allowScripts;
  }

  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function resolveOAuthProviders(state: CliState): OAuthProvider[] {
  const selected = state.oauthProviders?.filter((provider): provider is OAuthProvider =>
    supportedOAuthProviders.includes(provider as OAuthProvider)
  );

  return selected?.length ? selected : ["google", "github"];
}

function providerTitle(provider: OAuthProvider): string {
  return provider === "github" ? "GitHub" : "Google";
}

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

async function writeProviderSpecificOAuthFiles(targetDir: string, providers: OAuthProvider[]) {
  const authPath = path.join(targetDir, "src/auth/auth.ts");
  const routesPath = path.join(targetDir, "src/auth/routes/oauth.routes.ts");
  const controllerPath = path.join(targetDir, "src/auth/controllers/oauth.controller.ts");
  const readmePath = path.join(targetDir, "README.md");
  const providerUnion = providers.map((provider) => `"${provider}"`).join(" | ");

  await fs.writeFile(authPath, `import { createAuthenik8 } from "authenik8-core";
import dotenv  from "dotenv";
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
`);

  await fs.writeFile(routesPath, `import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { oauthController } from "../controllers/oauth.controller";

const router = express.Router();

${providers.map(providerRoutesBlock).join("\n")}

export default router;
`);

  await fs.writeFile(controllerPath, `import { Request, Response } from "express";
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
`);

  if (await fs.pathExists(readmePath)) {
    const selectedList = providers.join(",");
    const routeList = providers
      .flatMap((provider) => [
        `GET /auth/${provider}`,
        `GET /auth/${provider}/callback`,
        `GET /auth/${provider}/link`,
      ])
      .join("\n");
    const browserUrls = providers.map((provider) => `http://localhost:3000/auth/${provider}`).join("\n");
    const callbackUrls = providers
      .map((provider) => `${providerTitle(provider)} callback URL:\n\n\`\`\`text\nhttp://localhost:3000/auth/${provider}/callback\n\`\`\``)
      .join("\n\n");

    let readme = (await fs.readFile(readmePath, "utf-8")).replace(/\r\n/g, "\n");
    readme = readme.replace("AUTHENIK8_OAUTH_PROVIDERS=google,github", `AUTHENIK8_OAUTH_PROVIDERS=${selectedList}`);
    readme = readme.replace(
      /GOOGLE_CLIENT_ID=your-google-client-id\nGOOGLE_CLIENT_SECRET=your-google-client-secret\nGOOGLE_REDIRECT_URI=http:\/\/localhost:3000\/auth\/google\/callback\nGITHUB_CLIENT_ID=your-github-client-id\nGITHUB_CLIENT_SECRET=your-github-client-secret\nGITHUB_REDIRECT_URI=http:\/\/localhost:3000\/auth\/github\/callback/,
      providers
        .flatMap((provider) => {
          const upper = provider.toUpperCase();
          return [
            `${upper}_CLIENT_ID=your-${provider}-client-id`,
            `${upper}_CLIENT_SECRET=your-${provider}-client-secret`,
            `${upper}_REDIRECT_URI=http://localhost:3000/auth/${provider}/callback`,
          ];
        })
        .join("\n"),
    );
    readme = readme.replace(
      /GET \/auth\/google\nGET \/auth\/google\/callback\nGET \/auth\/github\nGET \/auth\/github\/callback\nGET \/auth\/google\/link\nGET \/auth\/github\/link/,
      routeList,
    );
    readme = readme.replace(/http:\/\/localhost:3000\/auth\/google\nhttp:\/\/localhost:3000\/auth\/github/, browserUrls);
    readme = readme.replace(
      /Google callback URL:\n\n```text\nhttp:\/\/localhost:3000\/auth\/google\/callback\n```\n\nGitHub callback URL:\n\n```text\nhttp:\/\/localhost:3000\/auth\/github\/callback\n```/,
      callbackUrls,
    );
    if (!providers.includes("google")) {
      readme = readme.replace(/\n- `GOOGLE_REDIRECT_URI`: must exactly match the callback URL configured in Google Cloud\./, "");
      readme = readme.replace(
        /\n\nexport function loginWithGoogle\(\) {\n  window\.location\.href = "http:\/\/localhost:3000\/auth\/google";\n}/,
        '\n\nexport function loginWithGitHub() {\n  window.location.href = "http://localhost:3000/auth/github";\n}',
      );
      readme = readme.replace(/\n\n`google OAuth is not configured`: add `google` to `AUTHENIK8_OAUTH_PROVIDERS` and set the Google env vars, or use only the enabled provider route\./, "");
    }
    if (!providers.includes("github")) {
      readme = readme.replace(/\n- `GITHUB_REDIRECT_URI`: must exactly match the callback URL configured in GitHub OAuth Apps\./, "");
      readme = readme.replace(/\n\n`github OAuth is not configured`: add `github` to `AUTHENIK8_OAUTH_PROVIDERS` and set the GitHub env vars, or use only the enabled provider route\./, "");
    }
    if (providers.includes("github") && !providers.includes("google")) {
      readme = readme.replace(
        "For OAuth, redirect the browser to `/auth/google` or `/auth/github`.",
        "For OAuth, redirect the browser to `/auth/github`.",
      );
    } else if (providers.includes("google") && !providers.includes("github")) {
      readme = readme.replace(
        "For OAuth, redirect the browser to `/auth/google` or `/auth/github`.",
        "For OAuth, redirect the browser to `/auth/google`.",
      );
    }
    await fs.writeFile(readmePath, readme);
  }
}

export async function createProject(
  state: CliState,
  targetDir: string,
  templateRoot: string
): Promise<void> {
  
  const templateName = resolveTemplateName(state.authMode ?? "base");
  const templatePath = path.join(templateRoot, templateName);
  const pkgExists = fs.existsSync(path.join(templatePath, "package.json"));

  if (!pkgExists) {
    throw new Error(`Template "${templateName}" is missing package.json at ${templatePath}`);
  }
  const stageDir = path.join(
    path.dirname(targetDir),
    `.${path.basename(targetDir)}.authenik8-${randomUUID()}`,
  );

  try {
    await fs.copy(templatePath, stageDir, {
      filter: (source) => !source.split(path.sep).includes("oauth-providers"),
    });

    const generatedPkgPath = path.join(stageDir, "package.json");
    const generatedPkg = await fs.readJson(generatedPkgPath);
    generatedPkg.name = state.projectName;
    await fs.writeJson(generatedPkgPath, generatedPkg, { spaces: 2 });

    const packagedGitignore = path.join(stageDir, "gitignore.template");
    if (await fs.pathExists(packagedGitignore)) {
      await fs.move(packagedGitignore, path.join(stageDir, ".gitignore"), {
        overwrite: true,
      });
    }

    if (state.authMode === "fullstack") {
      await fs.copy(path.join(templatePath, ".env.example"), path.join(stageDir, ".env"));
      const providers = state.oauthProviders === undefined
        ? [...supportedOAuthProviders]
        : resolveOAuthProviders(state).filter((provider) => state.oauthProviders?.includes(provider));
      await fs.writeFile(
        path.join(stageDir, "apps/web/src/auth/providers.ts"),
        `export type OAuthProvider = "google" | "github";\n\nexport const enabledOAuthProviders: readonly OAuthProvider[] = ${JSON.stringify(providers)};\n`,
      );
    }
    if (state.authMode !== "fullstack") {
      await fs.copy(path.join(templateRoot, "THREAT_MODEL.md"), path.join(stageDir, "THREAT_MODEL.md"));
    }
    await fs.copy(
      path.join(templateRoot, "AGENT_IDENTITY.md"),
      path.join(stageDir, "AGENT_IDENTITY.md"),
    );
    if (state.authMode === "auth-oauth") {
      await writeProviderSpecificOAuthFiles(stageDir, resolveOAuthProviders(state));
    }

    if (await fs.pathExists(targetDir)) {
      throw new Error(`Directory "${path.basename(targetDir)}" was created while setup was running.`);
    }
    await fs.move(stageDir, targetDir);
  } catch (error) {
    await fs.remove(stageDir);
    throw error;
  }

}
