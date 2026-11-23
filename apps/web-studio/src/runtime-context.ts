import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Runtime context reminder, adapted from the DeepSeek Harness runtime-context
 * injection:
 *
 * - the model gets a compact, deterministic snapshot of the project at the
 *   start of a turn and again after tools change it;
 * - the snapshot is logged as a system message, so model-visible equals
 *   logged and the next request can be replayed from the log;
 * - only names and package metadata are included: no file contents, no
 *   absolute paths, and never the values in `.env`.
 */

export const RUNTIME_CONTEXT_PREFIX = "<runtime-context>";

const MAX_ROOT_ENTRIES = 40;
const MAX_SCRIPTS = 12;
const MAX_PACKAGE_BYTES = 32 * 1024;
const MAX_FIELD_CHARS = 80;
const SKIP_ROOT = new Set(["node_modules", ".git", ".authenik8"]);
const PRESENCE_PATHS = [
  "design/tokens.json",
  "design/DESIGN.md",
  "index.html",
  "server.js",
  "src",
  "public",
  ".env",
];

export type RuntimeContextInput = {
  sandboxRoot: string;
  /** Whether the project dev server is currently running. */
  running: boolean;
};

/** File names and package fields are data, not prompt structure. */
function clean(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "?")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, MAX_FIELD_CHARS);
}

async function rootEntries(root: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !SKIP_ROOT.has(entry.name.toLowerCase()))
    .map((entry) => `${clean(entry.name)}${entry.isDirectory() ? "/" : ""}`)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_ROOT_ENTRIES);
}

async function packageSummary(root: string): Promise<string> {
  const file = path.join(root, "package.json");
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return "package.json: absent";
  }
  if (size > MAX_PACKAGE_BYTES) return "package.json: present (large; not summarized)";

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return "package.json: present (unparseable)";
  }
  if (typeof parsed !== "object" || parsed === null) return "package.json: present (unparseable)";
  const record = parsed as Record<string, unknown>;

  const name = typeof record.name === "string" && record.name.trim() !== ""
    ? `name "${clean(record.name.trim())}"`
    : "unnamed";
  const scripts = typeof record.scripts === "object" && record.scripts !== null
    ? Object.keys(record.scripts as Record<string, unknown>).slice(0, MAX_SCRIPTS).map(clean)
    : [];
  const dependencyCount = ["dependencies", "devDependencies"]
    .map((key) => {
      const value = record[key];
      return typeof value === "object" && value !== null ? Object.keys(value as Record<string, unknown>).length : 0;
    })
    .reduce((sum, count) => sum + count, 0);
  const scriptText = scripts.length > 0 ? `scripts ${scripts.join(", ")}` : "no scripts";
  return `package.json: ${name}; ${scriptText}; dependencies ${dependencyCount}`;
}

async function presentPaths(root: string): Promise<string[]> {
  const present: string[] = [];
  for (const relative of PRESENCE_PATHS) {
    try {
      await stat(path.join(root, relative));
      present.push(relative);
    } catch {
      // Absent is the common case; only presence is reported.
    }
  }
  return present;
}

export async function buildRuntimeContext(input: RuntimeContextInput): Promise<string> {
  const [entries, packageLine, present] = await Promise.all([
    rootEntries(input.sandboxRoot),
    packageSummary(input.sandboxRoot),
    presentPaths(input.sandboxRoot),
  ]);

  return [
    RUNTIME_CONTEXT_PREFIX,
    "Generated project snapshot. Verify with the file tools before relying on it.",
    `- root: ${entries.length > 0 ? entries.join(", ") : "(empty)"}`,
    `- ${packageLine}`,
    `- present: ${present.length > 0 ? present.join(", ") : "none"}`,
    `- dev server: ${input.running ? "running" : "stopped"}`,
    "</runtime-context>",
  ].join("\n");
}
