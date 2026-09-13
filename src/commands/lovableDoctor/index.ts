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

export function findValidatorScript(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // SECURITY: only ever execute the validator template packaged with the CLI.
  // Never resolve scripts/doctor-lovable.mjs from process.cwd() or from the
  // user-supplied target directory: both are attacker-controlled data, and the
  // entire purpose of this command is to audit potentially untrusted projects
  // (CWE-94 arbitrary code execution). The target directory is passed to the
  // trusted validator as a data argument only.
  const candidates = [
    path.resolve(currentDir, "../../../../templates/fullstack/scripts/doctor-lovable.mjs"),
    path.resolve(currentDir, "../../../templates/fullstack/scripts/doctor-lovable.mjs"),
  ];
  const script = candidates.find((candidate) => fs.existsSync(candidate));
  if (!script) {
    throw new Error(
      "Could not find the packaged scripts/doctor-lovable.mjs validator. The CLI installation may be incomplete.",
    );
  }
  return script;
}

export function runLovableDoctorCommand(options: LovableDoctorOptions): number {
  const result = spawnSync(
    process.execPath,
    [findValidatorScript(), options.directory, ...options.forwardedArguments],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 2;
}
