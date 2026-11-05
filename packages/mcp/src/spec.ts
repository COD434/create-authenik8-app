import { z } from "zod";

/**
 * Vendored Authenik8 project specification snapshot.
 *
 * PROVENANCE: mirrored from the generator CLI repository
 * (`create-authenik8-app`) at the commit recorded below. The CLI repository
 * remains the source of truth; when its schemas change, this snapshot MUST
 * be re-derived and this provenance record updated. Do not edit these
 * enums or rules ad hoc: a snapshot that disagrees with CLI state or
 * `authenik8.json` is a defect.
 */

export const SPEC_SNAPSHOT = {
  specVersion: 1,
  cliBranch: "feat/ai-age-roadmap-inflight",
  cliCommit: "6d29dca",
  mirroredFrom: [
    "src/lib/schemas.ts",
    "src/lib/constants.ts",
    "src/lib/projectManifest.ts",
    "src/lib/args.ts",
  ],
} as const;

export const SPEC_SUPPORTED = {
  framework: ["Express"],
  presets: ["base", "auth", "auth-oauth", "fullstack"],
  frontends: ["react", "lovable", "next"],
  databases: ["sqlite", "postgresql"],
  runtimes: ["node", "bun"],
  oauthProviders: ["google", "github"],
  authMethods: ["password", "google", "github"],
  packageManagers: ["npm", "pnpm", "bun"],
} as const;

export const presetSchema = z.enum(SPEC_SUPPORTED.presets);
export const frontendSchema = z.enum(SPEC_SUPPORTED.frontends);
export const databaseSchema = z.enum(SPEC_SUPPORTED.databases);
export const runtimeSchema = z.enum(SPEC_SUPPORTED.runtimes);
export const oauthProviderSchema = z.enum(SPEC_SUPPORTED.oauthProviders);
export const authMethodSchema = z.enum(SPEC_SUPPORTED.authMethods);
export const packageManagerSchema = z.enum(SPEC_SUPPORTED.packageManagers);

/**
 * A generation request, mirroring the CLI's prompt-answer state
 * (promptAnswersSchema + configuredCliStateSchema rules) without its
 * interactive-UI preprocessing. Optional fields follow the CLI's
 * non-interactive flags; conditional rules are enforced by validateSpec.
 */
export const projectSpecSchema = z.strictObject({
  projectName: z
    .string()
    .max(214)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, {
      message:
        "Use a lowercase name containing only letters, numbers, dots, hyphens, or underscores.",
    }),
  preset: presetSchema,
  frontend: frontendSchema.optional(),
  authMethods: z.array(authMethodSchema).optional(),
  oauthProviders: z.array(oauthProviderSchema).optional(),
  usePrisma: z.boolean().optional(),
  database: databaseSchema.optional(),
  runtime: runtimeSchema.optional(),
  packageManager: packageManagerSchema.optional(),
  useGit: z.boolean().optional(),
  productionReady: z.boolean().optional(),
});

export type ProjectSpec = z.infer<typeof projectSpecSchema>;
export type SpecIssue = { path: string; message: string };

export type SpecValidationResult =
  | { valid: true; normalized: ProjectSpec }
  | { valid: false; issues: SpecIssue[] };

/** First-issue message format, mirroring the CLI's firstZodIssue. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Input validation failed";
  const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${location}${issue.message}`;
}

/**
 * Validate a generation request under the CLI's conditional rules and, for
 * accepted specs, apply the CLI's fullstack normalization (defaults and
 * derived OAuth providers). This is a pure mirror of the generator's rules:
 * no files are read or written.
 */
export function validateSpec(input: ProjectSpec): SpecValidationResult {
  const issues: SpecIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (input.preset === "fullstack") {
    if (!input.authMethods?.includes("password")) {
      add("authMethods", "Email and password is required by the first full-stack preset");
    }
    if (input.database !== undefined && input.database !== "postgresql") {
      add("database", "The full-stack preset requires PostgreSQL");
    }
    if (input.runtime !== undefined && input.runtime !== "node") {
      add("runtime", "The full-stack preset requires the Node.js runtime");
    }
  }

  if (input.preset === "auth-oauth" && !input.oauthProviders?.length) {
    add("oauthProviders", "Select at least one OAuth provider");
  }

  if (input.preset === "base" && input.usePrisma === undefined) {
    add("usePrisma", "Choose whether to add Prisma");
  }

  const requiresDatabase = input.preset === "auth"
    || input.preset === "auth-oauth"
    || (input.preset === "base" && input.usePrisma === true);
  if (requiresDatabase && !input.database) {
    add("database", "Select a database");
  }

  if (issues.length > 0) return { valid: false, issues };

  // Mirror of the CLI's fullstack transform: explicit defaults and derived
  // OAuth providers. Other presets keep the caller's values as-is.
  if (input.preset === "fullstack") {
    return {
      valid: true,
      normalized: {
        ...input,
        frontend: input.frontend ?? "react",
        authMethods: input.authMethods,
        usePrisma: true,
        database: "postgresql",
        runtime: "node",
        oauthProviders: (input.authMethods ?? []).filter(
          (method): method is Exclude<typeof method, "password"> => method !== "password",
        ),
      },
    };
  }
  return { valid: true, normalized: input };
}
