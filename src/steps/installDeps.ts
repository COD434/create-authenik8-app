import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { spinner } from "../lib/ui.js";

export async function installDependencies(targetDir: string): Promise<void> {
  spinner.start("Installing dependencies...(this may take a few minutes)");
  try {
    await run(getCommand("npm"), ["install"], {
      cwd: targetDir,
      stdio: "inheritt",
    });
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to install dependencies");
    exitForInterrupt(err);
  }
}

export async function generatePrismaClient(targetDir: string): Promise<void> {
  spinner.start("Generating Prisma client...");
  try {
    await run(getCommand("npx"), ["prisma@5.22.0", "generate"], {
      cwd: targetDir,
      stdio: "ignore",
    });
    spinner.stop();
  } catch (err) {
    spinner.fail("Failed to generate Prisma client");
    exitForInterrupt(err);
  }
}
