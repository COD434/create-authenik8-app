import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { designTokensSchema, type DesignTokens } from "./tokens.js";

/**
 * Design-system bundle loading.
 *
 * A bundle is a directory containing:
 * - `tokens.json`  — machine-readable design tokens (required, validated)
 * - `DESIGN.md`    — human/agent-readable brand spec (optional)
 *
 * Loading touches only these two files inside the declared directory; no
 * directory listing, no writes, no network.
 */

export const TOKENS_FILENAME = "tokens.json";
export const DESIGN_MD_FILENAME = "DESIGN.md";

export type DesignSystemBundle = {
  directory: string;
  tokens: DesignTokens;
  designMd: string | null;
};

export class BundleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleLoadError";
  }
}

export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Validation failed";
  const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${location}${issue.message}`;
}

export async function loadDesignSystem(directory: string): Promise<DesignSystemBundle> {
  const tokensPath = path.join(directory, TOKENS_FILENAME);
  let source: string;
  try {
    source = await readFile(tokensPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new BundleLoadError(`${TOKENS_FILENAME} not found in ${directory}`);
    }
    throw new BundleLoadError(`${TOKENS_FILENAME} could not be read`);
  }

  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    throw new BundleLoadError(`${TOKENS_FILENAME} is not valid JSON`);
  }

  const parsed = designTokensSchema.safeParse(json);
  if (!parsed.success) {
    throw new BundleLoadError(
      `${TOKENS_FILENAME} does not match the design tokens schema: ${firstIssueMessage(parsed.error)}`,
    );
  }

  let designMd: string | null = null;
  try {
    designMd = await readFile(path.join(directory, DESIGN_MD_FILENAME), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new BundleLoadError(`${DESIGN_MD_FILENAME} could not be read`);
    }
  }

  return { directory, tokens: parsed.data, designMd };
}
