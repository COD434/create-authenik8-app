import fs from "fs-extra";
import path from "path";
import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { spinner } from "../lib/ui.js";

import { execSync } from "child_process";

const PM2_VERSION = "^5.4.2";
const TS_NODE_VERSION = "^10.9.2";

export function hasBun(): boolean {
  try {
    execSync("bun --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function resolveRuntime(runtime: any): "node" | "bun" {
  if (runtime === "bun" && !hasBun()) {
	  console.log("⚠️ Bun not found, falling back to Node");
    return "node";
  }
  if (runtime === "bun") return "bun";
  return "node";
}


export function createPm2Config(targetDir: string, projectName: string,runtime: "node" |"bun"): void {
  const configPath = path.join(targetDir, "ecosystem.config.js");
  const useBun = runtime === "bun";

  const content =  useBun 
  ?`module.exports = {
  apps: [
    {
      name: "${projectName}",
      script: "src/server.ts",
      interpreter: "bun",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}`:
	`module.exports = {
  apps: [
    {
      name: "${projectName}",
      script: "src/server.ts",
      instances: "max",
      interpreter:"node",
      interpreter_args: "-r ts-node/register",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};`

  fs.writeFileSync(configPath, content, "utf-8");
}


export async function configureProduction(targetDir: string,projectName:string , runtime:"node"| "bun"): Promise<void> {
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  pkg.dependencies["pm2"] = PM2_VERSION;

  
  if (runtime === "node") {
    pkg.dependencies["ts-node"] = TS_NODE_VERSION;
  }
  pkg.scripts["pm2:start"] = "npx pm2 start ecosystem.config.js";
  pkg.scripts["pm2:stop"] = `npx pm2 stop ${projectName}`;
  pkg.scripts["pm2:logs"] = "npx pm2 logs";

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    createPm2Config(targetDir, projectName,runtime);
  }
  



export async function initGit(targetDir: string): Promise<void> {
  try {
    await run(getCommand("git"), ["init"], {
      cwd: targetDir,
      stdio: "ignore",
    });
    spinner.stop();
  } catch {
    spinner.fail("Git init failed");
  }
}

export function appendProductionReadme(targetDir: string, projectName: string): void {
  fs.appendFileSync(
    path.join(targetDir, "README.md"),
    `

🚀 Production Mode

This project is configured for production using PM2.

Start app in cluster mode:

npm run pm2:start

View logs:

npm run pm2:logs

Stop app:

npm run pm2:stop

   `
  );
}
