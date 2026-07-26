import type { CliArguments } from "./args.js";
import { firstZodIssue, promptAnswersSchema } from "./schemas.js";
import type { CliState, OAuthProviderName, Runtime } from "./types.js";

type NonInteractiveEnvironment = {
  bunAvailable: boolean;
};

function fail(message: string): never {
  throw new Error(`Invalid non-interactive configuration: ${message}`);
}

function rejectOAuthOption(options: CliArguments): void {
  if (options.oauthProviders !== undefined) {
    fail("--oauth/--no-oauth only applies to auth-oauth and fullstack presets");
  }
}

function productionRuntime(
  options: CliArguments,
  environment: NonInteractiveEnvironment,
): Runtime | undefined {
  if (!options.productionReady) {
    if (options.runtime !== undefined) {
      fail("--runtime requires --production-ready for Express presets");
    }
    return undefined;
  }

  const runtime = options.runtime ?? "node";
  if (runtime === "bun" && !environment.bunAvailable) {
    fail("the Bun runtime was selected but bun is not available on PATH");
  }
  return runtime;
}

export function resolveNonInteractiveAnswers(
  options: CliArguments,
  environment: NonInteractiveEnvironment,
): Partial<CliState> {
  if (!options.nonInteractive) fail("--non-interactive or --yes is required");
  if (options.resume) fail("--resume cannot be combined with non-interactive generation");
  const authMode = options.preset ?? fail("--preset is required");
  const useGit = options.useGit ?? false;
  let raw: Record<string, unknown>;

  if (authMode === "base") {
    rejectOAuthOption(options);
    if (options.usePrisma === undefined) fail("the base preset requires --prisma or --no-prisma");
    if (options.usePrisma && !options.database) fail("--prisma requires --database sqlite or postgresql");
    if (!options.usePrisma && options.database) fail("--database cannot be used with --no-prisma");
    const runtime = productionRuntime(options, environment);
    raw = {
      framework: "Express",
      authMode,
      usePrisma: options.usePrisma,
      ...(options.database ? { database: options.database } : {}),
      useGit,
      ...(runtime ? { runtime } : {}),
    };
  } else if (authMode === "auth") {
    rejectOAuthOption(options);
    if (options.usePrisma === false) fail("the auth preset requires Prisma");
    if (!options.database) fail("the auth preset requires --database sqlite or postgresql");
    const runtime = productionRuntime(options, environment);
    raw = {
      framework: "Express",
      authMode,
      usePrisma: true,
      database: options.database,
      useGit,
      ...(runtime ? { runtime } : {}),
    };
  } else if (authMode === "auth-oauth") {
    if (options.usePrisma === false) fail("the auth-oauth preset requires Prisma");
    if (!options.database) fail("the auth-oauth preset requires --database sqlite or postgresql");
    const oauthProviders = options.oauthProviders;
    if (!oauthProviders?.length) fail("the auth-oauth preset requires --oauth google, github, or google,github");
    const runtime = productionRuntime(options, environment);
    raw = {
      framework: "Express",
      authMode,
      usePrisma: true,
      database: options.database,
      oauthProviders,
      useGit,
      ...(runtime ? { runtime } : {}),
    };
  } else {
    if (options.productionReady) fail("--production-ready configures PM2 and is only available for Express presets");
    if (options.usePrisma === false) fail("the fullstack preset requires Prisma");
    if (options.database && options.database !== "postgresql") {
      fail("the fullstack preset requires PostgreSQL");
    }
    if (options.runtime && options.runtime !== "node") {
      fail("the fullstack preset requires the Node.js runtime");
    }
    if (options.oauthProviders === undefined) {
      fail("the fullstack preset requires --oauth google,github or --no-oauth");
    }
    const oauthProviders: OAuthProviderName[] = options.oauthProviders;
    raw = {
      framework: "Express",
      authMode,
      authMethods: ["password", ...oauthProviders],
      useGit,
    };
  }

  const result = promptAnswersSchema.safeParse(raw);
  if (!result.success) fail(firstZodIssue(result.error));
  return result.data;
}
