import path from "node:path";
import fs from "fs-extra";

import { readProjectManifest } from "../../lib/projectManifest.js";
import type { AddContext } from "./types.js";

export class AddProjectError extends Error {}

export async function createAddContext(directory: string): Promise<AddContext> {
  const rootDir = path.resolve(directory);
  if (!(await fs.pathExists(path.join(rootDir, "package.json")))) {
    throw new AddProjectError(`No package.json found in ${rootDir}.`);
  }

  const result = await readProjectManifest(rootDir);
  if (result.status === "missing") {
    throw new AddProjectError(
      "authenik8.json is required for safe recipe changes. Regenerate or migrate this legacy project first.",
    );
  }
  if (result.status === "invalid") throw new AddProjectError(result.message);

  return { rootDir, manifest: result.manifest };
}
