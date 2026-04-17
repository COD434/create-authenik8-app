import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import type { CliState } from "../lib/types.js";

export function resolveTemplateName(authMode: string): string {
  if (authMode === "auth") return "express-auth";
  if (authMode === "auth-oauth") return "express-auth+";
  return "express-base";
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
