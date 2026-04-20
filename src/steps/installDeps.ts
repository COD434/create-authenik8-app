import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { spinner } from "../lib/ui.js";

export type PackageManager = "pnpm" | "bun" | "npm";

export function detectPackageManager(): PackageManager {
  try {
    if (process.env.npm_execpath?.includes("pnpm")) return "pnpm";
    if (process.env.npm_execpath?.includes("bun")) return "bun";
    execSync("pnpm --version", { stdio: "ignore" });
    return "pnpm";
  } catch {}
  try {
    execSync("bun --version", { stdio: "ignore" });
    return "bun";
  } catch {}
  return "npm";
}


function getInstallArgs(pm: PackageManager, targetDir: string): string[] {
  switch (pm) {
    case "pnpm":
      return ["install", "--prefer-offline"];
    case "bun":
      return ["install"];
    case "npm":
    default: 
    return ["install", "--prefer-offline", "--no-audit", "--no-fund"];
    
  }
}

export async function installDependencies(targetDir: string): Promise<void> {
  const pm = detectPackageManager();
  spinner.start("Installing dependencies...(this may take a few minutes)");
  try {
    await run(getCommand(pm), getInstallArgs(pm, targetDir), {
      cwd: targetDir,
      stdio: "inherit",
    });
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to install dependencies");
    exitForInterrupt(err);
  throw err;
  }
}

