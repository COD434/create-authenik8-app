import path from "node:path";

import { createDoctorContext } from "./context.js";
import { runStaticChecks } from "./checks.js";
import { redisEndpointFromEnv, probeRedis } from "./services.js";
import type {
  DoctorCheck,
  DoctorOptions,
  DoctorReport,
  DoctorRuntimeOptions,
} from "./types.js";

export class DoctorUsageError extends Error {}

export type ParsedDoctorArguments = DoctorOptions & { help: boolean };

export function parseDoctorArguments(
  args: readonly string[],
  cwd = process.cwd(),
): ParsedDoctorArguments {
  let directory: string | undefined;
  let json = false;
  let skipServices = false;
  let help = false;

  for (const argument of args) {
    if (argument === "--json") json = true;
    else if (argument === "--skip-services") skipServices = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument.startsWith("-")) throw new DoctorUsageError(`Unknown doctor option: ${argument}`);
    else if (directory) throw new DoctorUsageError("Doctor accepts at most one project directory.");
    else directory = argument;
  }

  return {
    directory: path.resolve(cwd, directory ?? "."),
    json,
    skipServices,
    help,
  };
}

function serviceCheck(
  status: DoctorCheck["status"],
  message: string,
  fix?: string,
): DoctorCheck {
  return {
    id: "service.redis",
    label: "Redis",
    status,
    message,
    ...(fix ? { fix } : {}),
  };
}

export async function runDoctor(
  options: DoctorOptions,
  runtime: DoctorRuntimeOptions = {},
): Promise<DoctorReport> {
  const context = await createDoctorContext(options.directory);
  const checks = await runStaticChecks(
    context,
    runtime.nodeVersion,
    runtime.allowMissingCore,
  );

  if (options.skipServices) {
    checks.push(serviceCheck("warn", "Live service checks were skipped"));
  } else if (context.envParseError) {
    checks.push(serviceCheck("warn", "Redis was not checked because .env is invalid"));
  } else if (context.env.REDIS_URL?.trim() === "memory://") {
    checks.push(serviceCheck("pass", "In-process Redis will initialize with the API process"));
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
      checks.push(serviceCheck("pass", `Redis answered PING at ${endpoint.host}:${endpoint.port}`));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      checks.push(serviceCheck(
        "fail",
        `Redis is not ready: ${detail}`,
        "Start the configured Redis service, then rerun doctor.",
      ));
    }
  }

  const summary = {
    passed: checks.filter((item) => item.status === "pass").length,
    warnings: checks.filter((item) => item.status === "warn").length,
    failed: checks.filter((item) => item.status === "fail").length,
  };
  return { rootDir: context.rootDir, preset: context.preset, checks, summary };
}
