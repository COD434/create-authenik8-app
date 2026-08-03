import path from "node:path";

import {
  createDoctorContext,
  DoctorProjectError,
} from "../doctor/context.js";
import { doctorExitCode, runDoctor } from "../doctor/index.js";
import { writeDoctorSupportReport } from "../doctor/report.js";
import type {
  DoctorContext,
  DoctorOptions,
  DoctorReport,
} from "../doctor/types.js";
import {
  inspectUserSessions,
  OpsReceiptError,
  OpsRuntimeError,
  revokeUserSessions,
  verifyOAuthProviders,
  type SessionRevocationOutcome,
} from "./runtime.js";
import {
  OpsSigningError,
  prepareSigningRotation,
  type PreparedSigningRotation,
} from "./signing.js";
import type {
  OpsOptions,
  OpsResult,
  ParsedOpsArguments,
  SessionInspection,
} from "./types.js";

export { OpsReceiptError, OpsRuntimeError, OpsSigningError };
export { DoctorProjectError };

export class OpsUsageError extends Error {}
export class OpsMutationError extends Error {}

export type OpsRuntime = {
  now?: () => Date;
  createContext?: (directory: string) => Promise<DoctorContext>;
  runDiagnostics?: (options: DoctorOptions) => Promise<DoctorReport>;
  writeSupportReport?: (report: DoctorReport) => Promise<string>;
  verifyOAuth?: typeof verifyOAuthProviders;
  prepareRotation?: typeof prepareSigningRotation;
  inspectSessions?: (
    context: DoctorContext,
    userId: string,
  ) => Promise<SessionInspection>;
  revokeSessions?: (
    context: DoctorContext,
    userId: string,
    reason: string,
    inspection: SessionInspection,
  ) => Promise<SessionRevocationOutcome>;
};

type RawArguments = {
  positionals: string[];
  json: boolean;
  help: boolean;
  apply: boolean;
  allSessions: boolean;
  confirmActiveKid?: string;
  confirmUser?: string;
  reason?: string;
  provider?: string;
  activateKid?: string;
  usedOptions: Set<string>;
};

function useOption(raw: RawArguments, option: string): void {
  if (raw.usedOptions.has(option)) {
    throw new OpsUsageError(`${option} may be specified only once.`);
  }
  raw.usedOptions.add(option);
}

function optionValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new OpsUsageError(`${option} requires a value.`);
  }
  return value;
}

function rawArguments(args: readonly string[]): RawArguments {
  const raw: RawArguments = {
    positionals: [],
    json: false,
    help: false,
    apply: false,
    allSessions: false,
    usedOptions: new Set(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      raw.json = true;
      useOption(raw, argument);
    } else if (argument === "--help" || argument === "-h") {
      raw.help = true;
    } else if (argument === "--apply") {
      raw.apply = true;
      useOption(raw, argument);
    } else if (argument === "--all-sessions") {
      raw.allSessions = true;
      useOption(raw, argument);
    } else if (argument === "--confirm-active-kid") {
      raw.confirmActiveKid = optionValue(args, index, argument);
      useOption(raw, argument);
      index += 1;
    } else if (argument === "--activate-kid") {
      raw.activateKid = optionValue(args, index, argument);
      useOption(raw, argument);
      index += 1;
    } else if (argument === "--confirm-user") {
      raw.confirmUser = optionValue(args, index, argument);
      useOption(raw, argument);
      index += 1;
    } else if (argument === "--reason") {
      raw.reason = optionValue(args, index, argument);
      useOption(raw, argument);
      index += 1;
    } else if (argument === "--provider") {
      raw.provider = optionValue(args, index, argument);
      useOption(raw, argument);
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new OpsUsageError(`Unknown ops option: ${argument}`);
    } else {
      raw.positionals.push(argument);
    }
  }
  return raw;
}

function rejectOptions(
  raw: RawArguments,
  allowed: ReadonlySet<string>,
): void {
  const unexpected = [...raw.usedOptions].filter(
    (option) => option !== "--json" && !allowed.has(option),
  );
  if (unexpected.length > 0) {
    throw new OpsUsageError(
      `${unexpected.join(", ")} cannot be used with this operation.`,
    );
  }
}

function resolveDirectory(cwd: string, value?: string): string {
  return path.resolve(cwd, value ?? ".");
}

function validOperatorText(
  value: string,
  minimum: number,
  maximum: number,
): boolean {
  return value.length >= minimum
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function parseProvider(value: string | undefined): "google" | "github" | undefined {
  if (value === undefined) return undefined;
  if (value === "google" || value === "github") return value;
  throw new OpsUsageError("OAuth provider must be google or github.");
}

export function parseOpsArguments(
  args: readonly string[],
  cwd = process.cwd(),
): ParsedOpsArguments {
  const raw = rawArguments(args);
  if (raw.help || raw.positionals.length === 0) {
    return { help: true, json: raw.json };
  }

  const [verb, noun, ...rest] = raw.positionals;
  if (verb === "readiness") {
    rejectOptions(raw, new Set());
    if (rest.length > 0) {
      throw new OpsUsageError("readiness accepts at most one project directory.");
    }
    return {
      help: false,
      operation: "readiness",
      directory: resolveDirectory(cwd, noun),
      json: raw.json,
    };
  }

  if (verb === "audit" && noun === "production") {
    rejectOptions(raw, new Set());
    if (rest.length > 1) {
      throw new OpsUsageError(
        "audit production accepts at most one project directory.",
      );
    }
    return {
      help: false,
      operation: "audit-production",
      directory: resolveDirectory(cwd, rest[0]),
      json: raw.json,
    };
  }

  if (verb === "verify" && noun === "oauth") {
    rejectOptions(raw, new Set(["--provider"]));
    let provider = parseProvider(raw.provider);
    let directory: string | undefined;
    if (rest[0] === "google" || rest[0] === "github") {
      if (provider) {
        throw new OpsUsageError(
          "Specify the OAuth provider either positionally or with --provider, not both.",
        );
      }
      provider = rest[0];
      directory = rest[1];
      if (rest.length > 2) {
        throw new OpsUsageError(
          "verify oauth accepts at most one project directory.",
        );
      }
    } else {
      directory = rest[0];
      if (rest.length > 1) {
        throw new OpsUsageError(
          "verify oauth accepts at most one project directory.",
        );
      }
    }
    return {
      help: false,
      operation: "verify-oauth",
      directory: resolveDirectory(cwd, directory),
      json: raw.json,
      ...(provider ? { provider } : {}),
    };
  }

  if (verb === "rotate" && noun === "signing-key") {
    rejectOptions(
      raw,
      new Set(["--apply", "--confirm-active-kid", "--activate-kid"]),
    );
    if (rest.length > 1) {
      throw new OpsUsageError(
        "rotate signing-key accepts at most one project directory.",
      );
    }
    if (!raw.apply && raw.confirmActiveKid) {
      throw new OpsUsageError("--confirm-active-kid requires --apply.");
    }
    return {
      help: false,
      operation: "rotate-signing-key",
      directory: resolveDirectory(cwd, rest[0]),
      json: raw.json,
      apply: raw.apply,
      ...(raw.confirmActiveKid
        ? { confirmActiveKid: raw.confirmActiveKid }
        : {}),
      ...(raw.activateKid ? { activateKid: raw.activateKid } : {}),
    };
  }

  if (verb === "revoke" && noun === "user") {
    rejectOptions(
      raw,
      new Set([
        "--apply",
        "--all-sessions",
        "--confirm-user",
        "--reason",
      ]),
    );
    const [userId, directory, ...extra] = rest;
    if (!userId || extra.length > 0) {
      throw new OpsUsageError(
        "revoke user requires a user ID and accepts at most one project directory.",
      );
    }
    if (!validOperatorText(userId, 1, 256)) {
      throw new OpsUsageError(
        "The user ID must contain 1-256 printable characters.",
      );
    }
    if (!raw.allSessions) {
      throw new OpsUsageError(
        "revoke user requires --all-sessions to make the scope explicit.",
      );
    }
    if (!raw.apply && (raw.confirmUser || raw.reason)) {
      throw new OpsUsageError(
        "--confirm-user and --reason require --apply.",
      );
    }
    if (raw.apply) {
      if (raw.confirmUser !== userId) {
        throw new OpsUsageError(
          "--confirm-user must exactly match the target user ID.",
        );
      }
      if (!raw.reason || !validOperatorText(raw.reason, 8, 256)) {
        throw new OpsUsageError(
          "--reason must contain 8-256 printable characters.",
        );
      }
    }
    return {
      help: false,
      operation: "revoke-user-sessions",
      directory: resolveDirectory(cwd, directory),
      json: raw.json,
      userId,
      apply: raw.apply,
      ...(raw.confirmUser ? { confirmUser: raw.confirmUser } : {}),
      ...(raw.reason ? { reason: raw.reason } : {}),
    };
  }

  throw new OpsUsageError(
    `Unknown ops operation: ${raw.positionals.slice(0, 2).join(" ")}`,
  );
}

function diagnosticOptions(directory: string): DoctorOptions {
  return {
    directory,
    json: true,
    skipServices: false,
    deep: true,
    production: true,
    fix: false,
    dryRun: false,
    ci: true,
    strict: true,
    report: false,
    offline: false,
  };
}

function signingVerificationOptions(directory: string): DoctorOptions {
  return {
    directory,
    json: true,
    skipServices: false,
    deep: false,
    production: false,
    fix: false,
    dryRun: false,
    checkId: "A8-JWK-006",
    ci: true,
    strict: true,
    report: false,
    offline: false,
  };
}

function oauthVerificationOptions(directory: string): DoctorOptions {
  return {
    directory,
    json: true,
    skipServices: true,
    deep: false,
    production: false,
    fix: false,
    dryRun: false,
    ci: true,
    strict: true,
    report: false,
    offline: false,
  };
}

async function rollbackRotation(
  rollback: () => Promise<void>,
  message: string,
): Promise<never> {
  try {
    await rollback();
  } catch (rollbackError) {
    const detail = rollbackError instanceof Error
      ? rollbackError.message
      : String(rollbackError);
    throw new OpsMutationError(
      `${message}; automatic rollback also failed: ${detail}`,
    );
  }
  throw new OpsMutationError(`${message}; .env was restored.`);
}

export async function runOps(
  options: OpsOptions,
  runtime: OpsRuntime = {},
): Promise<OpsResult> {
  const now = (runtime.now ?? (() => new Date()))();
  const createContext = runtime.createContext
    ?? ((directory: string) => createDoctorContext(directory));
  const runDiagnostics = runtime.runDiagnostics ?? runDoctor;
  const context = await createContext(options.directory);
  const base = {
    schemaVersion: 1 as const,
    rootDir: context.rootDir,
    preset: context.preset,
    generatedAt: now.toISOString(),
  };

  if (
    options.operation === "readiness"
    || options.operation === "audit-production"
  ) {
    const diagnostics = await runDiagnostics(
      diagnosticOptions(options.directory),
    );
    const failed = doctorExitCode(diagnostics, true) !== 0;
    const reportPath = options.operation === "audit-production"
      ? await (runtime.writeSupportReport ?? writeDoctorSupportReport)(
          diagnostics,
        )
      : undefined;
    return {
      ...base,
      operation: options.operation,
      status: failed ? "failed" : "passed",
      diagnostics,
      ...(reportPath ? { reportPath } : {}),
    };
  }

  if (options.operation === "verify-oauth") {
    const diagnostics = await runDiagnostics(
      oauthVerificationOptions(options.directory),
    );
    const requestedProviders = options.provider
      ? [options.provider]
      : context.oauthProviders;
    if (requestedProviders.length === 0) {
      throw new OpsRuntimeError(
        "No supported OAuth providers are enabled in this project.",
      );
    }
    const verifyOAuth = runtime.verifyOAuth ?? verifyOAuthProviders;
    const diagnosticIds = {
      google: "A8-OAUTH-002",
      github: "A8-OAUTH-003",
    } as const;
    const providers = await Promise.all(
      requestedProviders.map(async (provider) => {
        const diagnostic = diagnostics.checks.find(
          (check) => check.id === diagnosticIds[provider],
        );
        if (!diagnostic || diagnostic.status !== "pass") {
          return {
            provider,
            status: "failed" as const,
            stateStored: false,
            message: diagnostic
              ? `${diagnostic.id} did not pass: ${diagnostic.message}`
              : `${diagnosticIds[provider]} was not produced for this project`,
          };
        }
        const [verification] = await verifyOAuth(context, provider);
        return verification ?? {
          provider,
          status: "failed" as const,
          stateStored: false,
          message: "Provider verification returned no result",
        };
      }),
    );
    return {
      ...base,
      operation: options.operation,
      status: providers.some((provider) => provider.status === "failed")
        ? "failed"
        : "passed",
      assurance: "redirect-initialization",
      limitation:
        "This proves local provider configuration, installed-core redirect generation, and one-use state handling. It does not contact the provider or prove that the provider accepts the client credentials.",
      providers,
    };
  }

  if (options.operation === "rotate-signing-key") {
    const prepared: PreparedSigningRotation = await (
      runtime.prepareRotation ?? prepareSigningRotation
    )(context, now, options.activateKid);
    if (!options.apply) {
      return {
        ...base,
        operation: options.operation,
        status: "planned",
        plan: prepared.plan,
        verified: false,
      };
    }
    if (options.confirmActiveKid !== prepared.plan.previousActiveKid) {
      throw new OpsUsageError(
        `--confirm-active-kid must exactly match the current active kid (${prepared.plan.previousActiveKid}).`,
      );
    }

    const rollback = await prepared.apply();
    let verification: DoctorReport;
    try {
      verification = await runDiagnostics(
        signingVerificationOptions(options.directory),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return await rollbackRotation(
        rollback,
        `Post-rotation verification could not complete: ${detail}`,
      );
    }
    const refreshed = await createContext(options.directory);
    const signingPassed = verification.checks.some(
      (check) => check.id === "A8-JWK-006" && check.status === "pass",
    );
    if (
      !signingPassed
      || refreshed.env.AUTHENIK8_ACTIVE_KID
        !== prepared.plan.activeKidAfter
    ) {
      return await rollbackRotation(
        rollback,
        "The new signing key did not pass post-rotation verification",
      );
    }
    return {
      ...base,
      operation: options.operation,
      status: "applied",
      plan: prepared.plan,
      verified: true,
    };
  }

  if (options.apply) {
    if (options.confirmUser !== options.userId) {
      throw new OpsUsageError(
        "--confirm-user must exactly match the target user ID.",
      );
    }
    if (
      !options.reason
      || !validOperatorText(options.reason, 8, 256)
    ) {
      throw new OpsUsageError(
        "--reason must contain 8-256 printable characters.",
      );
    }
  }
  const inspection = await (
    runtime.inspectSessions ?? inspectUserSessions
  )(context, options.userId);
  const plan = {
    userId: options.userId,
    activeCoreSessions: inspection.activeCoreSessions,
    ...(inspection.activeDatabaseSessions === undefined
      ? {}
      : { activeDatabaseSessions: inspection.activeDatabaseSessions }),
    reasonRecorded: context.preset === "fullstack",
  };
  if (!options.apply) {
    return {
      ...base,
      operation: options.operation,
      status: "planned",
      plan,
      coreRevoked: false,
      ...(context.preset === "fullstack"
        ? {
            databaseRevoked: false,
            auditRecorded: false,
          }
        : {}),
    };
  }

  const outcome = await (runtime.revokeSessions ?? revokeUserSessions)(
    context,
    options.userId,
    options.reason!,
    inspection,
  );
  return {
    ...base,
    operation: options.operation,
    status: outcome.partialMessage ? "partial" : "applied",
    plan: outcome.plan,
    coreRevoked: outcome.coreRevoked,
    ...(outcome.databaseRevoked === undefined
      ? {}
      : { databaseRevoked: outcome.databaseRevoked }),
    ...(outcome.auditRecorded === undefined
      ? {}
      : { auditRecorded: outcome.auditRecorded }),
    ...(outcome.receiptPath ? { receiptPath: outcome.receiptPath } : {}),
    ...(outcome.partialMessage ? { message: outcome.partialMessage } : {}),
  };
}

export function opsExitCode(result: OpsResult): 0 | 1 | 4 {
  if (result.status === "partial") return 4;
  if (result.status === "failed") return 1;
  return 0;
}
