import fs from "fs-extra";
import path from "path";
import { run, getCommand, exitForInterrupt } from "../lib/process.js";
import { getBestHashLib, generateHashModule } from "../utils/hash.js";
import { spinner } from "../lib/ui.js";
import type { PackageManager } from "./installDeps.js";



export async function installAuth(
  targetDir: string,pm: PackageManager
): Promise<string> {
  let selectedHash = getBestHashLib(pm);


  spinner.start("Installing password auth...");

  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  
  pkg.dependencies[selectedHash] = selectedHash === "argon2" ? "^0.31.2" : "^2.4.3";
  
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

spinner.stop();

  const hashLib = selectedHash as "argon2" | "bcryptjs";
  await fs.writeFile(
    path.join(targetDir, "src/utils/hash.ts"),
    generateHashModule(hashLib)
  );

  return selectedHash;
}
