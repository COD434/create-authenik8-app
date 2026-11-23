import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { ProjectImportFile } from "./import.js";
import { resolveInsideSandbox } from "./tools.js";
import type { ZipEntry } from "./zip.js";

const MAX_EXPORT_FILES = 2_000;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

/**
 * Dotfiles that are safe to ship in an export even though every other
 * dotfile (`.env`, `.git`, `.authenik8`, ...) is withheld. These are
 * documentation/template files the recipient needs to run the project;
 * `.env.example` carries placeholders only by contract (see the chat
 * prompt and the directory lease) and never a real secret.
 */
const EXPORTABLE_DOTFILES = new Set([
  ".env.example",
  ".gitignore",
  ".editorconfig",
  ".cursorrules",
  ".windsurfrules",
]);

/** Directories of dotfiles that are safe to ship in full. */
const EXPORTABLE_DOT_DIRECTORIES = new Set([".github"]);

export async function importFileState(
  sandboxRoot: string,
  relative: string,
): Promise<"new" | "conflict" | "blocked"> {
  const target = resolveInsideSandbox(sandboxRoot, relative);
  if (target === null) return "blocked";
  const segments = relative.split("/");
  let current = sandboxRoot;
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]!);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) return "blocked";
      if (index < segments.length - 1 && !entry.isDirectory()) return "blocked";
      if (index === segments.length - 1) return entry.isFile() ? "conflict" : "blocked";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return "new";
    }
  }
  return "new";
}

export async function inspectProjectImport(sandboxRoot: string, files: ProjectImportFile[]) {
  const inspected = await Promise.all(files.map(async (file) => ({
    path: file.path,
    bytes: file.data.length,
    state: await importFileState(sandboxRoot, file.path),
  })));
  return {
    files: inspected,
    conflicts: inspected.filter((file) => file.state === "conflict").length,
    blocked: inspected.filter((file) => file.state === "blocked").length,
  };
}

/**
 * Collect sandbox project files for export: skips dotfiles (.env never
 * leaves the machine) except for an explicit allow-list of template files
 * (.env.example, .gitignore, .github, ...), skips node_modules, with hard
 * caps on file count and total bytes. Zip names use forward slashes per the
 * ZIP convention.
 */
export async function collectProjectFiles(sandboxRoot: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  let totalBytes = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (entries.length >= MAX_EXPORT_FILES || depth > 12) return;
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (entries.length >= MAX_EXPORT_FILES || totalBytes > MAX_EXPORT_BYTES) return;
      if (dirent.name === "node_modules") continue;
      if (dirent.name.startsWith(".")) {
        // Withhold all dotfiles by default (`.env`, `.git`, `.authenik8`
        // never leave the machine). Only an explicit allow-list of template
        // files ships.
        if (dirent.isDirectory()) {
          if (!EXPORTABLE_DOT_DIRECTORIES.has(dirent.name)) continue;
        } else {
          if (!EXPORTABLE_DOTFILES.has(dirent.name)) continue;
        }
      }
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (dirent.isFile()) {
        const data = await readFile(full);
        totalBytes += data.length;
        if (totalBytes > MAX_EXPORT_BYTES) return;
        entries.push({ name: path.relative(sandboxRoot, full).split(path.sep).join("/"), data });
      }
    }
  }

  await walk(sandboxRoot, 0);
  return entries;
}
