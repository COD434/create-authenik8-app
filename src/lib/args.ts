import { z } from "zod";
import {
  authModeSchema,
  databaseSchema,
  firstZodIssue,
  oauthProvidersSchema,
  packageManagerSchema,
  runtimeSchema,
} from "./schemas.js";
import type {
  AuthMode,
  Database,
  OAuthProviderName,
  PackageManager,
  Runtime,
} from "./types.js";

const cliArgumentsSchema = z.strictObject({
  projectName: z.string().optional(),
  help: z.boolean(),
  version: z.boolean(),
  resume: z.boolean(),
  skipInstall: z.boolean(),
  productionReady: z.boolean(),
  packageManager: packageManagerSchema.optional(),
  nonInteractive: z.boolean(),
  preset: authModeSchema.optional(),
  usePrisma: z.boolean().optional(),
  database: databaseSchema.optional(),
  oauthProviders: oauthProvidersSchema.optional(),
  useGit: z.boolean().optional(),
  runtime: runtimeSchema.optional(),
});

export type CliArguments = z.infer<typeof cliArgumentsSchema>;

const positionalArgumentsSchema = z.array(z.string()).max(1, {
  error: (issue) => {
    const values = Array.isArray(issue.input) ? issue.input : [];
    return `Unexpected argument "${String(values[1] ?? "")}". Only one project name is allowed.`;
  },
});

function parsePackageManager(value: string | undefined): PackageManager {
  const result = packageManagerSchema.safeParse(value);
  if (!result.success) throw new Error(firstZodIssue(result.error));
  return result.data;
}

function parseChoice<T>(
  value: string | undefined,
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: z.ZodError } },
  option: string,
  allowed: string,
): T {
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires ${allowed}.`);
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`${option} must be ${allowed}. Received "${value}".`);
  return result.data;
}

function parseOAuthProviders(value: string | undefined): OAuthProviderName[] {
  if (!value || value.startsWith("-")) {
    throw new Error("--oauth requires google, github, or google,github.");
  }
  const providers = value.split(",").map((provider) => provider.trim()).filter(Boolean);
  const result = oauthProvidersSchema.min(1).safeParse(providers);
  if (!result.success) {
    throw new Error(`--oauth requires unique supported providers. ${firstZodIssue(result.error)}`);
  }
  return result.data;
}

function setBooleanChoice(
  current: boolean | undefined,
  value: boolean,
  positiveOption: string,
  negativeOption: string,
): boolean {
  if (current !== undefined && current !== value) {
    throw new Error(`${positiveOption} and ${negativeOption} cannot be used together.`);
  }
  return value;
}

export function parseCliArguments(argv: string[]): CliArguments {
  const parsed: CliArguments = {
    help: false,
    version: false,
    resume: false,
    skipInstall: false,
    productionReady: false,
    nonInteractive: false,
  };
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;

    if (argument === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      parsed.version = true;
      continue;
    }
    if (argument === "--resume") {
      parsed.resume = true;
      continue;
    }
    if (argument === "--no-install" || argument === "--noInstall") {
      parsed.skipInstall = true;
      continue;
    }
    if (argument === "--production-ready") {
      parsed.productionReady = true;
      continue;
    }
    if (argument === "--yes" || argument === "--non-interactive") {
      parsed.nonInteractive = true;
      continue;
    }
    if (argument === "--prisma") {
      parsed.usePrisma = setBooleanChoice(parsed.usePrisma, true, "--prisma", "--no-prisma");
      continue;
    }
    if (argument === "--no-prisma") {
      parsed.usePrisma = setBooleanChoice(parsed.usePrisma, false, "--prisma", "--no-prisma");
      continue;
    }
    if (argument === "--git") {
      parsed.useGit = setBooleanChoice(parsed.useGit, true, "--git", "--no-git");
      continue;
    }
    if (argument === "--no-git") {
      parsed.useGit = setBooleanChoice(parsed.useGit, false, "--git", "--no-git");
      continue;
    }
    if (argument === "--no-oauth") {
      if (parsed.oauthProviders !== undefined) {
        throw new Error("--oauth and --no-oauth cannot be used together.");
      }
      parsed.oauthProviders = [];
      continue;
    }
    if (argument === "--package-manager") {
      const value = argv[index + 1];
      parsed.packageManager = parsePackageManager(value?.startsWith("-") ? undefined : value);
      index += 1;
      continue;
    }
    if (argument.startsWith("--package-manager=")) {
      parsed.packageManager = parsePackageManager(argument.slice("--package-manager=".length));
      continue;
    }
    if (argument === "--preset" || argument.startsWith("--preset=")) {
      if (parsed.preset !== undefined) throw new Error("--preset may only be provided once.");
      const inline = argument.startsWith("--preset=");
      const value = inline ? argument.slice("--preset=".length) : argv[index + 1];
      parsed.preset = parseChoice<AuthMode>(value, authModeSchema, "--preset", "base, auth, auth-oauth, or fullstack");
      if (!inline) index += 1;
      continue;
    }
    if (argument === "--database" || argument.startsWith("--database=")) {
      if (parsed.database !== undefined) throw new Error("--database may only be provided once.");
      const inline = argument.startsWith("--database=");
      const value = inline ? argument.slice("--database=".length) : argv[index + 1];
      parsed.database = parseChoice<Database>(value, databaseSchema, "--database", "sqlite or postgresql");
      if (!inline) index += 1;
      continue;
    }
    if (argument === "--runtime" || argument.startsWith("--runtime=")) {
      if (parsed.runtime !== undefined) throw new Error("--runtime may only be provided once.");
      const inline = argument.startsWith("--runtime=");
      const value = inline ? argument.slice("--runtime=".length) : argv[index + 1];
      parsed.runtime = parseChoice<Runtime>(value, runtimeSchema, "--runtime", "node or bun");
      if (!inline) index += 1;
      continue;
    }
    if (argument === "--oauth" || argument.startsWith("--oauth=")) {
      if (parsed.oauthProviders !== undefined) {
        throw new Error(parsed.oauthProviders.length === 0
          ? "--oauth and --no-oauth cannot be used together."
          : "--oauth may only be provided once.");
      }
      const inline = argument.startsWith("--oauth=");
      const value = inline ? argument.slice("--oauth=".length) : argv[index + 1];
      parsed.oauthProviders = parseOAuthProviders(value);
      if (!inline) index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option "${argument}". Run with --help for usage.`);
    }

    positionals.push(argument);
  }

  const positionalResult = positionalArgumentsSchema.safeParse(positionals);
  if (!positionalResult.success) {
    throw new Error(firstZodIssue(positionalResult.error));
  }

  if (positionalResult.data[0]) parsed.projectName = positionalResult.data[0];
  const nonInteractiveOnly = [
    parsed.preset,
    parsed.usePrisma,
    parsed.database,
    parsed.oauthProviders,
    parsed.useGit,
    parsed.runtime,
  ];
  if (!parsed.nonInteractive && nonInteractiveOnly.some((value) => value !== undefined)) {
    throw new Error("--preset, --prisma, --database, --oauth, --git, and --runtime require --non-interactive (or --yes).");
  }
  if (parsed.nonInteractive && parsed.resume) {
    throw new Error("--resume cannot be combined with --non-interactive or --yes.");
  }
  return cliArgumentsSchema.parse(parsed);
}
