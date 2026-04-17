import fs from "fs-extra";
import path from "path";
import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { spinner } from "../lib/ui.js";

export async function configureProduction(targetDir: string): Promise<void> {
  spinner.start("Setting up production mode (PM2)...");
  try {
    await run(getCommand("npm"), ["install", "pm2"], {
      cwd: targetDir,
      stdio: "ignore",
    });
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to install PM2");
    exitForInterrupt(err);
  }
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
