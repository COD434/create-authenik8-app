import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { spinner } from "../lib/ui.js";

export type PackageManager = "pnpm" | "bun" | "npm";

function commandSucceeds(command: string): boolean {
  try {
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function detectPackageManager(): PackageManager {
  try {
    if (process.env.npm_execpath?.includes("pnpm")) return "pnpm";
    if (process.env.npm_execpath?.includes("bun")) return "bun";
    if (process.env.npm_execpath?.includes("npm")) return "npm";
    execSync("pnpm --version", { stdio: "ignore" });
    return "pnpm";
  } catch {}
  try {
    execSync("bun --version", { stdio: "ignore" });
    return "bun";
  } catch {}
  return "npm";
}

function getRedisInstallCommand(): string | null {
  if (process.platform === "darwin" && commandSucceeds("brew --version")) {
    return "brew install redis";
  }

  if (process.platform === "Win32" && commandSucceeds("npm.cmd -v")){
return "npm.cmd -y install redis-server";
  }

  if (process.platform === "linux") {
    if (commandSucceeds("apt-get --version")) {
      return "sudo apt-get update && sudo apt-get install -y redis-server";
    }
    if (commandSucceeds("dnf --version")) {
      return "sudo dnf install -y redis";
    }
    if (commandSucceeds("yum --version")) {
      return "sudo yum install -y redis";
    }
    if (commandSucceeds("pacman --version")) {
      return "sudo pacman -Sy --noconfirm redis";
    }
  }

  return null;
}

export function ensureRedisServerInstalled(): void {
  if (commandSucceeds("redis-server --version")) {
    return;
  }

  const installCommand = getRedisInstallCommand();
  if (!installCommand) {
    throw new Error("Redis server is required but could not be installed automatically.");
  }

  execSync(installCommand, { stdio: "inherit" });
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
  spinner.start("Installing Redis server if needed...");
  try {
    ensureRedisServerInstalled();
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to install Redis server");
    await exitForInterrupt(err);
    throw err;
  }

  spinner.start("Installing dependencies...(this may take a few minutes)");
  try {
    await run(getCommand(pm), getInstallArgs(pm, targetDir), {
      cwd: targetDir,
      stdio: "ignore",
    });
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to install dependencies");
    await exitForInterrupt(err);
    throw err;
  }
}
