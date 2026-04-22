import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import type { CliState } from "../lib/types.js";

export function resolveTemplateName(authMode: string): string {
  if (authMode === "auth") return "express-auth";
  if (authMode === "auth-oauth") return "express-auth+";
  return "express-base";
}

export function configurePackageJson(targetDir: string, usePrisma: boolean): void {
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  if (!pkg.scripts.postinstall?.includes("prisma")) {
      pkg.scripts.postinstall = "npx prisma@5.22.0 generate";
    }

  if (usePrisma) {
   const currentDev = pkg.scripts.dev || "tsx watch src/index.ts";
    if (!currentDev.includes("prisma@5.22.0 generate")) {
      pkg.scripts.dev = `npx prisma@5.22.0 generate && ${currentDev}`;
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

export async function createProject(
  state: CliState,
  targetDir: string,
  templateRoot: string
): Promise<void> {
  const templateName = resolveTemplateName(state.authMode ?? "base");
  const templatePath = path.join(templateRoot, templateName);
  await fs.copy(templatePath, targetDir);
}
