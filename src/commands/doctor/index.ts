import path from "node:path";

import {
  diagnosticDefinition,
  diagnosticSelection,
} from "./catalog.js";
import { runProductionChecks, runStaticChecks } from "./checks.js";
import { createDoctorContext } from "./context.js";
import { runDeepChecks } from "./deep.js";
import { runDoctorFixes } from "./fixes.js";
import { probeRedis, redisEndpointFromEnv } from "./services.js";
import type {
  DoctorCheck,
  DoctorMode,
  DoctorOptions,
  DoctorReport,
  DoctorRuntimeOptions,
} from "./types.js";

export class DoctorUsageError extends Error {}

export type ParsedDoctorArguments = DoctorOptions & { help: boolean };

function optionValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new DoctorUsageError(`${option} requires a diagnostic ID.`);
  }
  return value.toUpperCase();
}

function validateDiagnosticId(id: string, option: string): string {
  if (!diagnosticDefinition(id)) {
    throw new DoctorUsageError(`Unknown diagnostic ID for ${option}: ${id}`);
  }
  return id;
}

export function parseDoctorArguments(
  args: readonly string[],
  cwd = process.cwd(),
): ParsedDoctorArguments {
  let directory: string | undefined;
  let json = false;
  let skipServices = false;
  let deep = false;
  let production = false;
  let fix = false;
  let dryRun = false;
  let checkId: string | undefined;
  let explainId: string | undefined;
  let ci = false;
  let strict = false;
  let report = false;
  let offline = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") json = true;
    else if (argument === "--skip-services") skipServices = true;
    else if (argument === "--deep") deep = true;
    else if (argument === "--production") production = true;
    else if (argument === "--fix") fix = true;
    else if (argument === "--dry-run") dryRun = true;
    else if (argument === "--ci") ci = true;
    else if (argument === "--strict") strict = true;
    else if (argument === "--report") report = true;
    else if (argument === "--offline") offline = true;
    else if (argument === "--check") {
      checkId = validateDiagnosticId(
        optionValue(args, index, "--check"),
        "--check",
      );
      index += 1;
    } else if (argument === "--explain") {
      explainId = validateDiagnosticId(
        optionValue(args, index, "--explain"),
        "--explain",
      );
      index += 1;
    } else if (argument === "--help" || argument === "-h") help = true;
    else if (argument.startsWith("-")) {
      throw new DoctorUsageError(`Unknown doctor option: ${argument}`);
    } else if (directory) {
      throw new DoctorUsageError("Doctor accepts at most one project directory.");
    } else directory = argument;
  }

  if (dryRun && !fix) {
    throw new DoctorUsageError("--dry-run requires --fix.");
  }
  if (checkId && explainId) {
    throw new DoctorUsageError("--check and --explain cannot be combined.");
  }
  if (
    explainId
    && (
      directory
      || deep
      || production
      || fix
      || dryRun
      || report
      || offline
      || skipServices
    )
  ) {
    throw new DoctorUsageError(
      "--explain does not run a project and cannot be combined with project modes.",
    );
  }
  if (fix && checkId) {
    throw new DoctorUsageError("--fix cannot be combined with --check.");
  }

  if (checkId === "A8-REDIS-002" || checkId === "A8-CORE-002") deep = true;
  if (checkId?.startsWith("A8-PROD-")) production = true;
  if (production) deep = true;
  if (offline && (deep || production)) {
    throw new DoctorUsageError("--offline cannot be combined with --deep or --production.");
  }

  return {
    directory: path.resolve(cwd, directory ?? "."),
    json,
    skipServices,
    deep,
    production,
    fix,
    dryRun,
    ...(checkId ? { checkId } : {}),
    ...(explainId ? { explainId } : {}),
    ci,
    strict,
    report,
    offline,
    help,
  };
}

function serviceCheck(
  status: DoctorCheck["status"],
  message: string,
  fix?: string,
): DoctorCheck {
  return {
    id: "A8-REDIS-002",
    label: "Redis capabilities",
    status,
    message,
    ...(fix ? { fix } : {}),
  };
}

function modeFor(options: DoctorOptions): DoctorMode {
  if (options.production) return "production";
  if (options.deep) return "deep";
  if (options.offline) return "offline";
  return "default";
}

function summarize(checks: readonly DoctorCheck[]) {
  return {
    passed: checks.filter((item) => item.status === "pass").length,
    warnings: checks.filter((item) => item.status === "warn").length,
    failed: checks.filter((item) => item.status === "fail").length,
    skipped: checks.filter((item) => item.status === "skip").length,
  };
}

function applyPrerequisiteSkips(checks: readonly DoctorCheck[]): DoctorCheck[] {
  const result = checks.map((item) => ({ ...item }));
  let changed = true;
  while (changed) {
    changed = false;
    const statuses = new Map(result.map((item) => [item.id, item.status]));
    for (const item of result) {
      if (item.status === "skip") continue;
      const blockedBy = diagnosticDefinition(item.id)?.prerequisites?.find(
        (id) => statuses.get(id) === "fail" || statuses.get(id) === "skip",
      );
      if (!blockedBy) continue;
      item.status = "skip";
      item.message = `Skipped because prerequisite ${blockedBy} did not pass`;
      delete item.fix;
      changed = true;
    }
  }
  return result;
}

function enrichDiagnosticEvidence(
  checks: readonly DoctorCheck[],
): DoctorCheck[] {
  return checks.map((item) => {
    if (item.status !== "fail" && item.status !== "warn") return item;
    const definition = diagnosticDefinition(item.id);
    if (!definition) return item;
    return {
      ...item,
      impact: definition.impact,
      remediation: item.fix ?? definition.remediation,
      verification: definition.verify,
    };
  });
}

function selectChecks(
  checks: readonly DoctorCheck[],
  checkId: string | undefined,
): DoctorCheck[] {
  if (!checkId) return [...checks];
  const selected = diagnosticSelection(checkId);
  const result = checks.filter((item) => selected.has(item.id));
  if (!result.some((item) => item.id === checkId)) {
    const definition = diagnosticDefinition(checkId)!;
    const blockedBy = result.find(
      (item) => item.status === "fail" || item.status === "skip",
    );
    result.push({
      id: checkId,
      label: definition.title,
      status: "skip",
      message: blockedBy
        ? `Skipped because prerequisite ${blockedBy.id} did not pass`
        : "This diagnostic does not apply to the detected preset or mode",
    });
  }
  return result;
}

async function runDoctorBase(
  options: DoctorOptions,
  runtime: DoctorRuntimeOptions,
): Promise<DoctorReport> {
  const context = await createDoctorContext(options.directory, {
    offline: Boolean(options.offline),
  });
  const checks = await runStaticChecks(
    context,
    runtime.nodeVersion,
    runtime.allowMissingCore,
    !options.offline,
  );
  if (options.production) checks.push(...runProductionChecks(context));

  const requestedChecks = options.checkId
    ? diagnosticSelection(options.checkId)
    : undefined;
  const shouldRunRedisService = !requestedChecks
    || requestedChecks.has("A8-REDIS-002");

  if (!shouldRunRedisService) {
    // A targeted diagnostic must not open unrelated service connections.
  } else if (options.offline) {
    checks.push(serviceCheck(
      "skip",
      "Offline mode validated configuration without opening a service connection",
    ));
  } else if (options.deep) {
    const failedPrerequisites = new Set(
      checks
        .filter(
          (item) => item.status === "fail"
            && ["A8-CORE-001", "A8-JWK-006", "A8-REDIS-001"].includes(item.id),
        )
        .map((item) => item.id),
    );
    if (failedPrerequisites.size > 0) {
      checks.push(
        serviceCheck(
          "skip",
          `Deep Redis checks skipped because prerequisites failed: ${[...failedPrerequisites].join(", ")}`,
        ),
        {
          id: "A8-CORE-002",
          label: "Identity engine runtime",
          status: "skip",
          message: "Deep core checks require valid dependency, signing, and Redis prerequisites",
        },
      );
    } else {
      checks.push(...await runDeepChecks(context));
    }
  } else if (options.skipServices) {
    checks.push(serviceCheck("warn", "Live service checks were skipped"));
  } else if (context.envParseError || context.envSource === "none") {
    checks.push(serviceCheck(
      "skip",
      "Redis was not checked because the environment source is unavailable or invalid",
    ));
  } else if (context.env.REDIS_URL?.trim() === "memory://") {
    checks.push(serviceCheck(
      "pass",
      "In-process Redis will initialize with the API process",
    ));
  } else {
    try {
      const usesRedisUrl = context.preset === "fullstack"
        || Boolean(context.env.REDIS_URL?.trim());
      const endpoint = redisEndpointFromEnv(context.env, usesRedisUrl);
      if (
        !endpoint.host
        || !Number.isInteger(endpoint.port)
        || endpoint.port < 1
        || endpoint.port > 65_535
      ) {
        throw new Error("Redis host or port is invalid");
      }
      await (runtime.redisProbe ?? probeRedis)(endpoint);
      checks.push(serviceCheck(
        "pass",
        `Redis answered PING at ${endpoint.host}:${endpoint.port}`,
      ));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      checks.push(serviceCheck(
        "fail",
        `Redis is not ready: ${detail}`,
        "Start the configured Redis service, then rerun Doctor.",
      ));
    }
  }

  const selectedChecks = enrichDiagnosticEvidence(
    selectChecks(applyPrerequisiteSkips(checks), options.checkId),
  );
  return {
    schemaVersion: 1,
    rootDir: context.rootDir,
    preset: context.preset,
    mode: modeFor(options),
    checks: selectedChecks,
    summary: summarize(selectedChecks),
  };
}

export async function runDoctor(
  options: DoctorOptions,
  runtime: DoctorRuntimeOptions = {},
): Promise<DoctorReport> {
  const initial = await runDoctorBase(options, runtime);
  if (!options.fix) return initial;

  const context = await createDoctorContext(options.directory, {
    offline: Boolean(options.offline),
  });
  const fixes = await runDoctorFixes(
    context,
    initial.checks,
    Boolean(options.dryRun),
    async () => {
      const {
        checkId: _checkId,
        ...verificationOptions
      } = options;
      return (
        await runDoctorBase(
          {
            ...verificationOptions,
            fix: false,
            dryRun: false,
            deep: false,
            production: false,
          },
          runtime,
        )
      ).checks;
    },
    runtime.onFixPlan,
  );
  if (options.dryRun) return { ...initial, fixes };

  const verified = await runDoctorBase({ ...options, fix: false }, runtime);
  return { ...verified, fixes };
}

export function doctorExitCode(
  report: DoctorReport,
  strict = false,
): 0 | 1 {
  return report.summary.failed > 0
    || (strict && report.summary.warnings > 0)
    ? 1
    : 0;
}
