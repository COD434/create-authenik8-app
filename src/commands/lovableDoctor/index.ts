import { spawnSync } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class LovableDoctorUsageError extends Error {}

export type LovableDoctorOptions = {
  directory: string;
  forwardedArguments: string[];
};

export function lovableDoctorHelp(): string {
  return `Usage:
  create-authenik8-app doctor frontend --target lovable [directory] [options]

Options:
  --json                  Emit stable JSON for CI
  --runtime               Add non-destructive checks against a test API
  --api-url <origin>      API origin used by --runtime
  --origin <origin>       Approved frontend origin used by --runtime

The command checks a Lovable frontend for common Authenik8 integration
mistakes. It is not a security certification.`;
}

export function parseLovableDoctorArguments(args: string[]): LovableDoctorOptions {
  if (args[0] !== "frontend") {
    throw new LovableDoctorUsageError('Expected "doctor frontend".');
  }
  let target: string | undefined;
  let directory: string | undefined;
  const forwardedArguments: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--target") {
      target = args[++index];
      if (!target || target.startsWith("-")) {
        throw new LovableDoctorUsageError("--target requires lovable.");
      }
    } else if (argument.startsWith("--target=")) {
      target = argument.slice("--target=".length);
    } else if (["--api-url", "--origin"].includes(argument)) {
      const value = args[++index];
      if (!value || value.startsWith("-")) {
        throw new LovableDoctorUsageError(`${argument} requires a value.`);
      }
      forwardedArguments.push(argument, value);
    } else if (["--json", "--runtime"].includes(argument)) {
      forwardedArguments.push(argument);
    } else if (argument === "--help" || argument === "-h") {
      throw new LovableDoctorUsageError(lovableDoctorHelp());
    } else if (argument.startsWith("-")) {
      throw new LovableDoctorUsageError(`Unknown Lovable Doctor option "${argument}".`);
    } else if (!directory) {
      directory = argument;
    } else {
      throw new LovableDoctorUsageError(`Unexpected argument "${argument}".`);
    }
  }
  if (target !== "lovable") {
    throw new LovableDoctorUsageError("--target lovable is required.");
  }
  return {
    directory: path.resolve(directory ?? process.cwd()),
    forwardedArguments,
  };
}

function findValidatorScript(directory: string): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "scripts/doctor-lovable.mjs"),
    path.join(directory, "scripts/doctor-lovable.mjs"),
    path.resolve(currentDir, "../../../../templates/fullstack/scripts/doctor-lovable.mjs"),
    path.resolve(currentDir, "../../../templates/fullstack/scripts/doctor-lovable.mjs"),
  ];
  const script = candidates.find((candidate) => fs.existsSync(candidate));
  if (!script) {
    throw new Error(
      "Could not find scripts/doctor-lovable.mjs. Run this from a generated Lovable-mode project.",
    );
  }
  return script;
}

export function runLovableDoctorCommand(options: LovableDoctorOptions): number {
  const result = spawnSync(
    process.execPath,
    [findValidatorScript(options.directory), options.directory, ...options.forwardedArguments],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 2;
}
