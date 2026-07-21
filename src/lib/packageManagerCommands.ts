import type { PackageManager } from "./types.js";

export function installCommand(packageManager: PackageManager): string {
  return `${packageManager} install`;
}

export function runScriptCommand(
  packageManager: PackageManager,
  script: string,
): string {
  return `${packageManager} run ${script}`;
}

export function packageCommand(
  packageManager: PackageManager,
  packageName: string,
  arguments_ = "",
): string {
  const suffix = arguments_ ? ` ${arguments_}` : "";
  if (packageManager === "pnpm") {
    return `pnpm dlx ${packageName}${suffix}`;
  }
  if (packageManager === "bun") {
    return `bunx ${packageName}${suffix}`;
  }
  return `npx ${packageName}${suffix}`;
}

export function binaryCommand(
  packageManager: PackageManager,
  binary: string,
  arguments_ = "",
): string {
  const suffix = arguments_ ? ` ${arguments_}` : "";
  if (packageManager === "pnpm") {
    return `pnpm exec ${binary}${suffix}`;
  }
  if (packageManager === "bun") {
    return `bunx ${binary}${suffix}`;
  }
  return `npx ${binary}${suffix}`;
}

export function productionReadmeCommands(
  packageManager: PackageManager,
): { start: string; logs: string; stop: string } {
  return {
    start: runScriptCommand(packageManager, "pm2:start"),
    logs: runScriptCommand(packageManager, "pm2:logs"),
    stop: runScriptCommand(packageManager, "pm2:stop"),
  };
}
