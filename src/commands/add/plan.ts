import path from "node:path";
import fs from "fs-extra";

import {
  ensureOAuthEnvironment,
  oauthProviders,
  supportedOAuthProviders,
  type OAuthEnvironmentPreset,
  type OAuthProvider,
} from "../../lib/oauth.js";
import {
  expressOAuthFiles,
  renderExpressOAuthFiles,
} from "../../lib/expressOAuth.js";
import {
  PROJECT_MANIFEST_FILENAME,
  projectManifestSchema,
} from "../../lib/projectManifest.js";
import type { AddContext, PlannedFileChange } from "./types.js";

const fullstackProviderFile = "apps/web/src/auth/providers.ts";

export class AddRecipeError extends Error {}

async function requiredSource(context: AddContext, relativePath: string): Promise<string> {
  const filename = path.join(context.rootDir, relativePath);
  if (!(await fs.pathExists(filename))) {
    throw new AddRecipeError(`Required generated file is missing: ${relativePath}`);
  }
  return fs.readFile(filename, "utf8");
}

function addChange(
  changes: PlannedFileChange[],
  relativePath: string,
  before: string,
  after: string,
  sensitive = false,
): void {
  if (before !== after) {
    changes.push({ relativePath, before, after, ...(sensitive ? { sensitive: true } : {}) });
  }
}

function sameProviders(left: readonly OAuthProvider[], right: readonly OAuthProvider[]): boolean {
  return left.length === right.length && left.every((provider, index) => provider === right[index]);
}

function nextProviders(
  current: readonly OAuthProvider[],
  added: OAuthProvider,
): OAuthProvider[] {
  const enabled = new Set([...current, added]);
  return oauthProviders.filter((provider) => enabled.has(provider));
}

function renderFullstackProviderSource(
  source: string,
  manifestProviders: readonly OAuthProvider[],
  providers: readonly OAuthProvider[],
): string {
  const pattern = /(export const enabledOAuthProviders[^=]*=\s*)(\[[^;]*\])/gs;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new AddRecipeError(
      `${fullstackProviderFile} does not contain one recognizable provider registry; refusing to guess.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0]?.[2] ?? "");
  } catch {
    throw new AddRecipeError(`${fullstackProviderFile} contains an invalid provider registry.`);
  }
  const actual = Array.isArray(parsed)
    ? supportedOAuthProviders(parsed.filter((value): value is string => typeof value === "string"))
    : [];
  if (!Array.isArray(parsed) || actual.length !== parsed.length || !sameProviders(actual, manifestProviders)) {
    throw new AddRecipeError(
      `${fullstackProviderFile} has drifted from authenik8.json; run doctor and reconcile it before adding auth features.`,
    );
  }

  return source.replace(pattern, `$1${JSON.stringify(providers)}`);
}

async function planExpressSource(
  context: AddContext,
  currentProviders: readonly OAuthProvider[],
  providers: readonly OAuthProvider[],
  changes: PlannedFileChange[],
): Promise<void> {
  const current = renderExpressOAuthFiles(currentProviders);
  const next = renderExpressOAuthFiles(providers);

  for (const relativePath of Object.values(expressOAuthFiles)) {
    const before = await requiredSource(context, relativePath);
    if (before !== current[relativePath]) {
      throw new AddRecipeError(
        `${relativePath} has local changes. The recipe will not overwrite modified auth code; integrate the provider manually or restore the generated file.`,
      );
    }
    addChange(changes, relativePath, before, next[relativePath]);
  }
}

async function planEnvironment(
  context: AddContext,
  provider: OAuthProvider,
  preset: OAuthEnvironmentPreset,
  changes: PlannedFileChange[],
): Promise<void> {
  for (const relativePath of [".env.example", ".env"]) {
    const before = await requiredSource(context, relativePath);
    const after = ensureOAuthEnvironment(before, provider, preset);
    addChange(changes, relativePath, before, after, relativePath === ".env");
  }
}

export async function planOAuthProvider(
  context: AddContext,
  provider: OAuthProvider,
): Promise<PlannedFileChange[]> {
  const { manifest } = context;
  if (manifest.preset !== "auth-oauth" && manifest.preset !== "fullstack") {
    throw new AddRecipeError(
      `oauth-${provider} supports auth-oauth and fullstack projects; this project uses ${manifest.preset}.`,
    );
  }

  const currentProviders = supportedOAuthProviders(manifest.features.oauthProviders);
  const providers = nextProviders(currentProviders, provider);
  const changes: PlannedFileChange[] = [];

  if (manifest.preset === "auth-oauth") {
    await planExpressSource(context, currentProviders, providers, changes);
  } else {
    const before = await requiredSource(context, fullstackProviderFile);
    addChange(
      changes,
      fullstackProviderFile,
      before,
      renderFullstackProviderSource(before, currentProviders, providers),
    );
  }

  await planEnvironment(
    context,
    provider,
    manifest.preset === "fullstack" ? "fullstack" : "express",
    changes,
  );

  if (!sameProviders(currentProviders, providers)) {
    const before = await requiredSource(context, PROJECT_MANIFEST_FILENAME);
    const updated = projectManifestSchema.parse({
      ...manifest,
      features: { ...manifest.features, oauthProviders: providers },
    });
    addChange(
      changes,
      PROJECT_MANIFEST_FILENAME,
      before,
      `${JSON.stringify(updated, null, 2)}\n`,
    );
  }

  return changes;
}
