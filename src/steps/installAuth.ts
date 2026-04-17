import fs from "fs-extra";
import path from "path";
import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { getBestHashLib, generateHashModule } from "../utils/hash.js";
import { spinner } from "../lib/ui.js";

export async function installAuth(
  targetDir: string
): Promise<string> {
  let selectedHash = getBestHashLib();

  spinner.start("Installing password auth...");

  try {
    await run(getCommand("npm"), ["install", selectedHash], {
      cwd: targetDir,
      stdio: "ignore",
    });
  } catch {
    if (selectedHash !== "bcryptjs") {
      spinner.warn(`${selectedHash} failed, falling back to bcryptjs`);
      await run(getCommand("npm"), ["install", "bcryptjs"], {
        cwd: targetDir,
        stdio: "ignore",
      });
      selectedHash = "bcryptjs";
    } else {
      spinner.fail("Failed to install password auth");
      process.exit(1);
    }
  }

  spinner.stop();

  const hashLib = selectedHash as "argon2" | "bcryptjs";
  await fs.writeFile(
    path.join(targetDir, "src/utils/hash.ts"),
    generateHashModule(hashLib)
  );

  return selectedHash;
}
