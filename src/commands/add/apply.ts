import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

import type { PlannedFileChange } from "./types.js";

export class ConcurrentRecipeChangeError extends Error {}

async function absolutePath(rootDir: string, relativePath: string): Promise<string> {
  const resolved = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Recipe path escapes the project: ${relativePath}`);
  }

  const realRoot = await fs.realpath(rootDir);
  let existing = resolved;
  while (!(await fs.pathExists(existing))) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const realExisting = await fs.realpath(existing);
  const realRelative = path.relative(realRoot, realExisting);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`Recipe path resolves outside the project: ${relativePath}`);
  }
  return resolved;
}

async function atomicWrite(filename: string, source: string): Promise<void> {
  await fs.ensureDir(path.dirname(filename));
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.authenik8-${process.pid}-${randomUUID()}.tmp`,
  );
  const mode = await fs.pathExists(filename) ? (await fs.stat(filename)).mode : 0o644;
  try {
    await fs.writeFile(temporary, source, { mode });
    await fs.move(temporary, filename, { overwrite: true });
  } finally {
    await fs.remove(temporary);
  }
}

async function sourceAt(filename: string): Promise<string | null> {
  return await fs.pathExists(filename) ? fs.readFile(filename, "utf8") : null;
}

async function commitChange(rootDir: string, change: PlannedFileChange): Promise<void> {
  const filename = await absolutePath(rootDir, change.relativePath);
  const current = await sourceAt(filename);
  if (current !== change.before) {
    throw new ConcurrentRecipeChangeError(
      `${change.relativePath} changed after the recipe was planned; nothing further was written.`,
    );
  }

  if (change.sensitive) {
    if (change.before === null) {
      throw new Error(`Sensitive recipe changes cannot create files: ${change.relativePath}`);
    }
    if (!change.after.startsWith(change.before)) {
      throw new Error(`Sensitive recipe changes must be append-only: ${change.relativePath}`);
    }
    await fs.appendFile(filename, change.after.slice(change.before.length));
    return;
  }
  try {
    await atomicWrite(filename, change.after);
  } catch (error) {
    if (change.before === null) await pruneEmptyParents(rootDir, filename);
    throw error;
  }
}

async function pruneEmptyParents(rootDir: string, filename: string): Promise<void> {
  let directory = path.dirname(filename);
  while (directory !== rootDir) {
    try {
      await fs.rmdir(directory);
    } catch {
      break;
    }
    directory = path.dirname(directory);
  }
}

async function restoreChange(rootDir: string, change: PlannedFileChange): Promise<void> {
  const filename = await absolutePath(rootDir, change.relativePath);
  if (change.before === null) {
    await fs.remove(filename);
    await pruneEmptyParents(rootDir, filename);
  } else if (change.sensitive) await fs.writeFile(filename, change.before);
  else await atomicWrite(filename, change.before);
}

/** Apply a plan as one guarded transaction, rolling back if commit or verification fails. */
export async function applyPlannedChanges(
  rootDir: string,
  changes: readonly PlannedFileChange[],
  verify: () => Promise<void>,
): Promise<void> {
  for (const change of changes) {
    const current = await sourceAt(await absolutePath(rootDir, change.relativePath));
    if (current !== change.before) {
      throw new ConcurrentRecipeChangeError(
        `${change.relativePath} changed after the recipe was planned; no files were written.`,
      );
    }
  }

  const ordered = [...changes].sort((left, right) => Number(left.sensitive) - Number(right.sensitive));
  const committed: PlannedFileChange[] = [];
  try {
    for (const change of ordered) {
      await commitChange(rootDir, change);
      committed.push(change);
    }
    await verify();
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const change of committed.reverse()) {
      try {
        await restoreChange(rootDir, change);
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        );
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Recipe failed and rollback was incomplete: ${rollbackErrors.join("; ")}`,
        { cause: error },
      );
    }
    throw error;
  }
}
