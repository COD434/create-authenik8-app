import fs from "fs-extra";
import path from "node:path";

export const oauthProviders = ["google", "github"] as const;

export type OAuthProvider = (typeof oauthProviders)[number];
export type OAuthEnvironmentPreset = "express" | "fullstack";

export function supportedOAuthProviders(
  providers: readonly string[] | undefined,
): OAuthProvider[] {
  return (providers ?? []).filter((provider): provider is OAuthProvider =>
    oauthProviders.includes(provider as OAuthProvider)
  );
}

export function filterOAuthEnvironment(
  source: string,
  enabledProviders: readonly OAuthProvider[],
): string {
  const enabledPrefixes = new Set(
    enabledProviders.map((provider) => provider.toUpperCase()),
  );

  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      if (line.startsWith("AUTHENIK8_OAUTH_PROVIDERS=")) return false;

      const provider = line.match(/^(GOOGLE|GITHUB)_/)?.[1];
      return !provider || enabledPrefixes.has(provider);
    })
    .join("\n")
    .replace(/\n*$/, "\n");
}

function environmentEntries(
  provider: OAuthProvider,
  preset: OAuthEnvironmentPreset,
): Array<readonly [string, string]> {
  const upper = provider.toUpperCase();
  const callbackPath = preset === "fullstack"
    ? `/api/auth/oauth/${provider}/callback`
    : `/auth/${provider}/callback`;
  const clientId = preset === "express" ? `"change-me-${provider}-client-id"` : "";
  const clientSecret = preset === "express"
    ? `"change-me-${provider}-client-secret"`
    : "";

  return [
    [`${upper}_CLIENT_ID`, clientId],
    [`${upper}_CLIENT_SECRET`, clientSecret],
    [`${upper}_REDIRECT_URI`, preset === "express"
      ? `"http://localhost:3000${callbackPath}"`
      : `http://localhost:3000${callbackPath}`],
  ];
}

function hasEnvironmentName(source: string, name: string): boolean {
  return source.split(/\r?\n/).some((line) =>
    new RegExp(`^(?:export\\s+)?${name}\\s*=`).test(line)
  );
}

/** Add only missing provider keys; existing credentials are never rewritten. */
export function ensureOAuthEnvironment(
  source: string,
  provider: OAuthProvider,
  preset: OAuthEnvironmentPreset,
): string {
  const normalized = source.replace(/\r\n/g, "\n");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const additions = environmentEntries(provider, preset)
    .filter(([name]) => !hasEnvironmentName(normalized, name))
    .map(([name, value]) => `${name}=${value}`);

  if (additions.length === 0) return source;
  const separator = source.length === 0 || source.endsWith("\n") ? "" : newline;
  return `${source}${separator}${additions.join(newline)}${newline}`;
}

export async function configureOAuthEnvironmentFiles(
  targetDir: string,
  enabledProviders: readonly OAuthProvider[],
): Promise<void> {
  for (const filename of [".env", ".env.example"]) {
    const envPath = path.join(targetDir, filename);
    if (!(await fs.pathExists(envPath))) continue;

    const source = await fs.readFile(envPath, "utf8");
    await fs.writeFile(
      envPath,
      filterOAuthEnvironment(source, enabledProviders),
    );
  }
}
