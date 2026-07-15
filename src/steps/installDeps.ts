import type { PackageManager } from "../lib/types.js";
import { commandExists, run, getCommand, exitForInterrupt } from "../lib/process.js";

export type { PackageManager } from "../lib/types.js";

export type InstallResult = {
  packageManager: PackageManager;
  durationMs: number;
};

function packageManagerFrom(value: string | undefined): PackageManager | undefined {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("pnpm")) return "pnpm";
  if (normalized.includes("bun")) return "bun";
  if (normalized.includes("npm")) return "npm";
  return undefined;
}

export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  const userAgentManager = packageManagerFrom(env.npm_config_user_agent?.split(" ")[0]);
  if (userAgentManager) return userAgentManager;

  const executableManager = packageManagerFrom(env.npm_execpath);
  if (executableManager) return executableManager;

  return "npm";
}

export function resolvePackageManagerForPreset(
  authMode: string | undefined,
  requested?: PackageManager,
  env: NodeJS.ProcessEnv = process.env,
): PackageManager {
  if (authMode === "fullstack") {
    if (requested && requested !== "npm") {
      throw new Error("The full-stack preset uses npm workspaces. Select npm or omit --package-manager.");
    }
    return "npm";
  }

  return requested ?? detectPackageManager(env);
}

export function isPackageManagerAvailable(pm: PackageManager): boolean {
  return commandExists(pm);
}

export function getInstallArgs(pm: PackageManager): string[] {
  switch (pm) {
    case "pnpm":
      return ["install", "--prefer-offline", "--reporter=append-only"];
    case "bun":
      return ["install", "--no-progress"];
    case "npm":
    default:
      return [
        "install",
        "--prefer-offline",
        "--no-audit",
        "--no-fund",
        "--progress=false",
        "--no-update-notifier",
      ];
  }
}

export async function installDependencies(
  targetDir: string,
  packageManager?: PackageManager,
): Promise<InstallResult> {
  const pm = packageManager ?? detectPackageManager();
  const startedAt = Date.now();
  const hideProgress = Boolean(
    process.stderr.isTTY && !process.env.CI && process.env.AUTHENIK8_VERBOSE !== "1",
  );
  try {
    await run(getCommand(pm), getInstallArgs(pm), {
      cwd: targetDir,
      stdio: hideProgress ? "pipe" : "inherit",
    });

    return {
      packageManager: pm,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    await exitForInterrupt(err);
    throw err;
  }
}
