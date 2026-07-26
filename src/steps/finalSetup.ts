import fs from "fs-extra";
import path from "path";
import {
  commandExists,
  run,
  getCommand,
  exitForInterrupt,
} from "../lib/process.js";
import {
  binaryCommand,
  productionReadmeCommands,
  runScriptCommand,
} from "../lib/packageManagerCommands.js";
import type { PackageManager } from "../lib/types.js";

const PM2_VERSION = "^5.4.2";

export function hasBun(): boolean {
  return commandExists("bun");
}

export function resolveRuntime(runtime: unknown): "node" | "bun" {
  if (runtime === "bun" && !hasBun()) {
    console.log("Bun was not found; using Node instead.");
    return "node";
  }
  if (runtime === "bun") return "bun";
  return "node";
}

export function createPm2Config(
  targetDir: string,
  projectName: string,
  runtime: "node" | "bun",
  productionEntry = "dist/server.js",
): void {
  const configPath = path.join(targetDir, "ecosystem.config.js");
  const useBun = runtime === "bun";

  const content = useBun
    ? `module.exports = {
  apps: [
    {
      name: "${projectName}",
      script: "${productionEntry}",
      interpreter: "bun",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}`
    : `module.exports = {
  apps: [
    {
      name: "${projectName}",
      script: "${productionEntry}",
      instances: "max",
      interpreter:"node",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};`;

  fs.writeFileSync(configPath, content, "utf-8");
}

export async function configureProduction(
  targetDir: string,
  projectName: string,
  runtime: "node" | "bun",
  packageManager: PackageManager = "npm",
): Promise<void> {
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  pkg.dependencies["pm2"] = PM2_VERSION;

  delete pkg.dependencies["ts-node"];
  const productionEntry = String(pkg.scripts.start ?? "node dist/server.js")
    .replace(/^node\s+/, "")
    .trim();
  pkg.scripts["pm2:start"] = `${runScriptCommand(packageManager, "build")} && ${binaryCommand(packageManager, "pm2", "start ecosystem.config.js")}`;
  pkg.scripts["pm2:stop"] = binaryCommand(packageManager, "pm2", `stop ${projectName}`);
  pkg.scripts["pm2:logs"] = binaryCommand(packageManager, "pm2", "logs");

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  createPm2Config(targetDir, projectName, runtime, productionEntry);
}

export async function initGit(targetDir: string): Promise<boolean> {
  if (!commandExists("git")) return false;

  try {
    await run(getCommand("git"), ["init"], {
      cwd: targetDir,
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    await exitForInterrupt(error);
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.warn(`Git initialization skipped: ${message}`);
    return false;
  }
}

export function appendProductionReadme(
  targetDir: string,
  projectName: string,
  packageManager: PackageManager = "npm",
): void {
  const readmePath = path.join(targetDir, "README.md");
  if (fs.readFileSync(readmePath, "utf8").includes("## Production Mode")) return;
  const commands = productionReadmeCommands(packageManager);
  fs.appendFileSync(
    readmePath,
    `

## Production Mode

This project is configured for production using PM2.

Build and start the compiled app in cluster mode:

${commands.start}

View logs:

${commands.logs}

Stop app:

${commands.stop}

   `,
  );
}
