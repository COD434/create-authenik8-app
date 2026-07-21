import path from "node:path";
import fs from "fs-extra";

import {
  binaryCommand,
  installCommand,
  packageCommand,
} from "../lib/packageManagerCommands.js";
import type { PackageManager } from "../lib/types.js";

export function renderPackageManagerReadme(
  source: string,
  packageManager: PackageManager,
): string {
  if (packageManager === "npm") return source;

  return source
    .replaceAll("npm install", installCommand(packageManager))
    .replaceAll("npm run ", `${packageManager} run `)
    .replaceAll(
      "npx create-authenik8-app",
      packageCommand(packageManager, "create-authenik8-app"),
    )
    .replaceAll(
      "npx prisma ",
      `${binaryCommand(packageManager, "prisma")} `,
    );
}

export async function configureGeneratedReadme(
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> {
  const readmePath = path.join(targetDir, "README.md");
  if (!(await fs.pathExists(readmePath))) return;

  const before = await fs.readFile(readmePath, "utf8");
  const after = renderPackageManagerReadme(before, packageManager);
  if (after !== before) await fs.writeFile(readmePath, after);
}
