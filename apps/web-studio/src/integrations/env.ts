import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { IntegrationError } from "./errors.js";

// ---------- env merge ----------

const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/;
const SAFE_ENV_VALUE = /^[A-Za-z0-9_@%+=:,./~?&-]+$/;

function quoteEnvValue(value: string): string {
  if (/[\r\n]/u.test(value)) {
    throw new IntegrationError(500, "An environment value contained a line break.", "env_value_invalid");
  }
  if (value.length > 0 && SAFE_ENV_VALUE.test(value) && !value.startsWith("#")) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type EnvMergeResult = {
  content: string;
  replaced: string[];
  added: string[];
};

/**
 * Merge managed values into a dotenv file. Existing keys are replaced in
 * place, duplicate managed keys are collapsed, unrelated lines and comments
 * are preserved, and the file's newline style is kept.
 */
export function mergeEnv(
  existing: string,
  values: Readonly<Record<string, string>>,
): EnvMergeResult {
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = /\r?\n$/.test(existing);
  const lines = existing === "" ? [] : existing.split(/\r?\n/);
  if (hadTrailingNewline) lines.pop();

  const keys = Object.keys(values);
  const replaced = new Set<string>();
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of lines) {
    const match = ENV_LINE.exec(line);
    const key = match?.[1];
    if (key !== undefined && Object.hasOwn(values, key)) {
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(`${key}=${quoteEnvValue(values[key] ?? "")}`);
      replaced.add(key);
      continue;
    }
    output.push(line);
  }

  const added = keys.filter((key) => !seen.has(key));
  if (added.length > 0) {
    while (output.length > 0 && output[output.length - 1]?.trim() === "") output.pop();
    if (output.length > 0) output.push("");
    if (!existing.includes("Authenik8 integrations")) {
      output.push("# Authenik8 integrations (written by Studio; never commit this file)");
    }
    for (const key of added) {
      output.push(`${key}=${quoteEnvValue(values[key] ?? "")}`);
    }
  }

  return {
    content: `${output.join(newline)}${newline}`,
    replaced: keys.filter((key) => replaced.has(key)),
    added,
  };
}

export type EnvWriteResult = {
  path: string;
  keys: string[];
  replaced: string[];
  added: string[];
};

export async function writeProjectEnv(
  sandboxRoot: string,
  values: Readonly<Record<string, string>>,
): Promise<EnvWriteResult> {
  await mkdir(sandboxRoot, { recursive: true });
  const envPath = path.join(sandboxRoot, ".env");
  const existing = await readFile(envPath, "utf8").catch(() => "");
  const merged = mergeEnv(existing, values);
  const temp = path.join(sandboxRoot, `.env.studio-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temp, merged.content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, envPath);
  return {
    path: envPath,
    keys: Object.keys(values),
    replaced: merged.replaced,
    added: merged.added,
  };
}

/** Parse a dotenv source into its key/value pairs, quotes stripped. */
export function envMap(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);
    if (match === null) continue;
    const key = match[1];
    if (key === undefined) continue;
    let value = line.slice(match[0].length).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}
