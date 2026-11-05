import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { SPEC_SNAPSHOT, firstIssueMessage } from "./spec.js";

/**
 * Mirror of the CLI's `authenik8.json` manifest contract
 * (projectManifestSchema, version 1) as of SPEC_SNAPSHOT. The manifest is
 * the source-controlled project contract; it never contains secrets.
 */

export const PROJECT_MANIFEST_FILENAME = "authenik8.json";

export const projectManifestV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  projectName: z
    .string()
    .max(214)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  generatedBy: z.strictObject({
    package: z.literal("create-authenik8-app"),
    version: z.string().trim().min(1).max(100),
  }),
  engine: z.strictObject({
    package: z.literal("authenik8-core"),
    version: z.string().trim().min(1).max(100),
  }),
  preset: z.enum(["base", "auth", "auth-oauth", "fullstack"]),
  packageManager: z.enum(["npm", "pnpm", "bun"]),
  runtime: z.enum(["node", "bun"]),
  database: z.enum(["sqlite", "postgresql"]).nullable(),
  features: z.strictObject({
    prisma: z.boolean(),
    oauthProviders: z.array(z.enum(["google", "github"])).max(2),
    pm2: z.boolean(),
    frontend: z.enum(["react", "lovable", "next"]).optional(),
  }),
}).superRefine((manifest, context) => {
  const issue = (path: Array<string | number>, message: string) => context.addIssue({
    code: "custom",
    path,
    message,
  });

  if (manifest.preset === "fullstack") {
    if (!manifest.features.prisma) issue(["features", "prisma"], "fullstack requires Prisma");
    if (manifest.database !== "postgresql") issue(["database"], "fullstack requires PostgreSQL");
    if (manifest.runtime !== "node") issue(["runtime"], "fullstack requires Node.js");
    if (manifest.packageManager !== "npm") issue(["packageManager"], "fullstack requires npm workspaces");
    if (manifest.features.pm2) issue(["features", "pm2"], "PM2 generation only applies to Express presets");
  }

  if (manifest.preset === "base") {
    if (manifest.features.prisma !== (manifest.database !== null)) {
      issue(["database"], "database must be null exactly when Prisma is disabled");
    }
    if (manifest.features.oauthProviders.length > 0) {
      issue(["features", "oauthProviders"], "the base preset does not include OAuth providers");
    }
  }

  if (manifest.preset === "auth" || manifest.preset === "auth-oauth") {
    if (!manifest.features.prisma || manifest.database === null) {
      issue(["features", "prisma"], `${manifest.preset} requires Prisma and a database`);
    }
  }

  if (manifest.preset !== "fullstack" && !manifest.features.pm2 && manifest.runtime !== "node") {
    issue(["runtime"], "Express presets use Node.js unless PM2 runtime generation is enabled");
  }

  if (manifest.preset === "auth" && manifest.features.oauthProviders.length > 0) {
    issue(["features", "oauthProviders"], "the auth preset does not include OAuth providers");
  }
  if (manifest.preset === "auth-oauth" && manifest.features.oauthProviders.length === 0) {
    issue(["features", "oauthProviders"], "the auth-oauth preset requires an OAuth provider");
  }
});

export type ProjectManifestV1 = z.infer<typeof projectManifestV1Schema>;

export type ManifestReadResult =
  | { status: "valid"; manifest: ProjectManifestV1 }
  | { status: "missing" }
  | { status: "invalid"; message: string };

/**
 * Read ONLY `<root>/authenik8.json`. No other file is opened, no directory
 * listing occurs, and raw file contents are never returned — only the
 * parsed manifest or a structured failure. Callers must pre-verify that
 * `root` is inside the configured workspace.
 */
export function readManifestSnapshot(root: string): ManifestReadResult {
  const manifestPath = path.join(root, PROJECT_MANIFEST_FILENAME);
  let source: string;
  try {
    source = readFileSync(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return { status: "invalid", message: `${PROJECT_MANIFEST_FILENAME} could not be read` };
  }

  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    return { status: "invalid", message: `${PROJECT_MANIFEST_FILENAME} is not valid JSON` };
  }

  const result = projectManifestV1Schema.safeParse(json);
  if (!result.success) {
    return {
      status: "invalid",
      message: `${PROJECT_MANIFEST_FILENAME} is invalid: ${firstIssueMessage(result.error)}`,
    };
  }
  return { status: "valid", manifest: result.data };
}

export { SPEC_SNAPSHOT };
