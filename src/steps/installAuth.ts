import fs from "fs-extra";
import path from "path";
import { getBestHashLib, generateHashModule } from "../utils/hash.js";
import type { PackageManager } from "./installDeps.js";

export async function installAuth(
  targetDir: string,
  pm: PackageManager,
): Promise<"bcryptjs"> {
  const selectedHash = getBestHashLib(pm);

  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  
  pkg.dependencies.bcryptjs = "^2.4.3";
  pkg.devDependencies = {
    ...pkg.devDependencies,
    "@types/bcryptjs": "^2.4.6",
  };

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  await fs.writeFile(
    path.join(targetDir, "src/utils/hash.ts"),
    generateHashModule("bcryptjs"),
  );

  return selectedHash;
}
