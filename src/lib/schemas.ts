import { z } from "zod";

const MAX_PACKAGE_NAME_LENGTH = 214;
const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export const packageManagerSchema = z.enum(["npm", "pnpm", "bun"], {
  error: (issue) => issue.input === undefined
    ? "--package-manager requires npm, pnpm, or bun."
    : `Unsupported package manager "${String(issue.input)}". Use npm, pnpm, or bun.`,
});

export const projectNameSchema = z
  .string()
  .max(
    MAX_PACKAGE_NAME_LENGTH,
    `Project names must be ${MAX_PACKAGE_NAME_LENGTH} characters or fewer.`,
  )
  .regex(
    PROJECT_NAME_PATTERN,
    "Use a lowercase name containing only letters, numbers, dots, hyphens, or underscores.",
  );

export const stepNameSchema = z.enum([
  "start",
  "prompts",
  "project-created",
  "auth-installed",
  "prisma-configured",
  "production-configured",
  "deps-installed",
  "git-initialized",
  "done",
]);

export const authModeSchema = z.enum(["base", "auth", "auth-oauth", "fullstack"]);
export const databaseSchema = z.enum(["sqlite", "postgresql"]);
export const runtimeSchema = z.enum(["node", "bun"]);
export const oauthProviderSchema = z.enum(["google", "github"]);
export const authMethodSchema = z.enum(["password", "google", "github"]);

function normalizeCheckboxChoices(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((choice) => {
    if (typeof choice === "object" && choice !== null && "value" in choice) {
      return (choice as { value?: unknown }).value;
    }
    return choice;
  });
}

export const authMethodSelectionSchema = z.preprocess(
  normalizeCheckboxChoices,
  z.array(authMethodSchema).refine((methods) => methods.includes("password"), {
    error: "Email and password is required by the first full-stack preset",
  }),
);

export const oauthProviderSelectionSchema = z.preprocess(
  normalizeCheckboxChoices,
  z.array(oauthProviderSchema).min(1, "Select at least one OAuth provider"),
);

const promptAnswersInputSchema = z.strictObject({
  framework: z.literal("Express"),
  authMode: authModeSchema,
  authMethods: z.array(authMethodSchema).optional(),
  oauthProviders: z.array(oauthProviderSchema).optional(),
  usePrisma: z.boolean().optional(),
  database: databaseSchema.optional(),
  useGit: z.boolean(),
  runtime: runtimeSchema.optional(),
}).superRefine((answers, context) => {
  if (answers.authMode === "fullstack") {
    const result = authMethodSelectionSchema.safeParse(answers.authMethods);
    if (!result.success) {
      context.addIssue({
        code: "custom",
        path: ["authMethods"],
        message: firstZodIssue(result.error),
      });
    }
  }

  if (answers.authMode === "auth-oauth") {
    const result = oauthProviderSelectionSchema.safeParse(answers.oauthProviders);
    if (!result.success) {
      context.addIssue({
        code: "custom",
        path: ["oauthProviders"],
        message: firstZodIssue(result.error),
      });
    }
  }

  if (answers.authMode === "base" && answers.usePrisma === undefined) {
    context.addIssue({
      code: "custom",
      path: ["usePrisma"],
      message: "Choose whether to add Prisma",
    });
  }

  const requiresDatabase = answers.authMode === "auth"
    || answers.authMode === "auth-oauth"
    || (answers.authMode === "base" && answers.usePrisma);
  if (requiresDatabase && !answers.database) {
    context.addIssue({
      code: "custom",
      path: ["database"],
      message: "Select a database",
    });
  }
}).transform((answers) => {
  if (answers.authMode !== "fullstack") return answers;

  const authMethods = authMethodSelectionSchema.parse(answers.authMethods);
  return {
    ...answers,
    authMethods,
    usePrisma: true,
    database: "postgresql" as const,
    runtime: "node" as const,
    oauthProviders: authMethods.filter(
      (method): method is z.infer<typeof oauthProviderSchema> => method !== "password",
    ),
  };
});

export const promptAnswersSchema = promptAnswersInputSchema;

export const cliStateSchema = z.strictObject({
  step: stepNameSchema,
  runtime: runtimeSchema.optional(),
  projectName: projectNameSchema,
  framework: z.string().min(1).max(100).optional(),
  usePrisma: z.boolean().optional(),
  database: databaseSchema.optional(),
  useGit: z.boolean().optional(),
  authMode: authModeSchema.optional(),
  hashLib: z.literal("bcryptjs").optional(),
  installDeps: z.boolean().optional(),
  packageManager: packageManagerSchema.optional(),
  oauthProviders: z.array(oauthProviderSchema).max(2).optional(),
  authMethods: z.array(authMethodSchema).max(3).optional(),
});

export const configuredCliStateSchema = cliStateSchema.extend({
  framework: z.string({ error: "Missing required input: framework" }).min(
    1,
    "Missing required input: framework",
  ),
  authMode: authModeSchema,
  usePrisma: z.boolean(),
  useGit: z.boolean(),
  packageManager: packageManagerSchema,
}).superRefine((state, context) => {
  if (state.usePrisma && !state.database) {
    context.addIssue({
      code: "custom",
      path: ["database"],
      message: "Missing required input: database",
    });
  }

  if (state.authMode === "fullstack") {
    if (state.database !== "postgresql") {
      context.addIssue({
        code: "custom",
        path: ["database"],
        message: "The full-stack preset requires PostgreSQL",
      });
    }
    if (state.runtime !== "node") {
      context.addIssue({
        code: "custom",
        path: ["runtime"],
        message: "The full-stack preset requires the Node.js runtime",
      });
    }
    if (!state.authMethods?.includes("password")) {
      context.addIssue({
        code: "custom",
        path: ["authMethods"],
        message: "Email and password is required by the first full-stack preset",
      });
    }
  }

  if (state.authMode === "auth-oauth" && !state.oauthProviders?.length) {
    context.addIssue({
      code: "custom",
      path: ["oauthProviders"],
      message: "Select at least one OAuth provider",
    });
  }
});

export function firstZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Input validation failed";
  const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${location}${issue.message}`;
}
