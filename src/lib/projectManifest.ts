import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { z } from "zod";

import {
  authModeSchema,
  databaseSchema,
  firstZodIssue,
  oauthProvidersSchema,
  packageManagerSchema,
  projectNameSchema,
  runtimeSchema,
} from "./schemas.js";
import type {
  AuthMode,
  Database,
  OAuthProviderName,
  PackageManager,
  Runtime,
} from "./types.js";

export const PROJECT_MANIFEST_FILENAME = "authenik8.json";
export const PROJECT_MANIFEST_VERSION = 1 as const;

const packageVersionSchema = z.string().trim().min(1).max(100);

export const projectManifestSchema = z.strictObject({
  schemaVersion: z.literal(PROJECT_MANIFEST_VERSION),
  projectName: projectNameSchema,
  generatedBy: z.strictObject({
    package: z.literal("create-authenik8-app"),
    version: packageVersionSchema,
  }),
  engine: z.strictObject({
    package: z.literal("authenik8-core"),
    version: packageVersionSchema,
  }),
  preset: authModeSchema,
  packageManager: packageManagerSchema,
  runtime: runtimeSchema,
  database: databaseSchema.nullable(),
  features: z.strictObject({
    prisma: z.boolean(),
    oauthProviders: oauthProvidersSchema,
    pm2: z.boolean(),
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

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export type ProjectManifestInput = {
  projectName: string;
  generatorVersion: string;
  preset: AuthMode;
  packageManager: PackageManager;
  runtime: Runtime;
  database?: Database;
  usePrisma: boolean;
  oauthProviders?: OAuthProviderName[];
  productionReady: boolean;
};

export type ProjectManifestReadResult =
  | { status: "valid"; manifest: ProjectManifest }
  | { status: "missing" }
  | { status: "invalid"; message: string };

async function declaredEngineVersion(targetDir: string, preset: AuthMode): Promise<string> {
  const packagePath = preset === "fullstack"
    ? path.join(targetDir, "apps/api/package.json")
    : path.join(targetDir, "package.json");
  const packageJson = await fs.readJson(packagePath) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const version = packageJson.dependencies?.["authenik8-core"]
    ?? packageJson.devDependencies?.["authenik8-core"];
  if (!version?.trim()) throw new Error("Generated project does not declare authenik8-core");
  return version;
}

export async function writeProjectManifest(
  targetDir: string,
  input: ProjectManifestInput,
): Promise<ProjectManifest> {
  const manifest = projectManifestSchema.parse({
    schemaVersion: PROJECT_MANIFEST_VERSION,
    projectName: input.projectName,
    generatedBy: {
      package: "create-authenik8-app",
      version: input.generatorVersion,
    },
    engine: {
      package: "authenik8-core",
      version: await declaredEngineVersion(targetDir, input.preset),
    },
    preset: input.preset,
    packageManager: input.packageManager,
    runtime: input.runtime,
    database: input.database ?? null,
    features: {
      prisma: input.usePrisma,
      oauthProviders: input.oauthProviders ?? [],
      pm2: input.productionReady,
    },
  });
  const manifestPath = path.join(targetDir, PROJECT_MANIFEST_FILENAME);
  const temporaryPath = `${manifestPath}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await fs.writeJson(temporaryPath, manifest, { spaces: 2 });
    await fs.move(temporaryPath, manifestPath, { overwrite: true });
  } finally {
    await fs.remove(temporaryPath);
  }
  return manifest;
}

export async function readProjectManifest(rootDir: string): Promise<ProjectManifestReadResult> {
  const manifestPath = path.join(rootDir, PROJECT_MANIFEST_FILENAME);
  if (!(await fs.pathExists(manifestPath))) return { status: "missing" };

  let source: unknown;
  try {
    source = await fs.readJson(manifestPath);
  } catch {
    return { status: "invalid", message: `${PROJECT_MANIFEST_FILENAME} is not valid JSON` };
  }
  const result = projectManifestSchema.safeParse(source);
  if (!result.success) {
    return {
      status: "invalid",
      message: `${PROJECT_MANIFEST_FILENAME} is invalid: ${firstZodIssue(result.error)}`,
    };
  }
  return { status: "valid", manifest: result.data };
}
