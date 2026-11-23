import path from "node:path";

/**
 * Filesystem bounds for read-only tools. Every fs-touching tool argument is
 * resolved against the configured workspace root and rejected if it would
 * escape it. The server never lists directories and never reads any file
 * except the project manifest.
 */

export class WorkspaceBoundsError extends Error {
  readonly code = "outside_workspace";

  constructor(target: string) {
    super(`Refusing to access "${target}" outside the configured workspace root`);
    this.name = "WorkspaceBoundsError";
  }
}

export function resolveWithinWorkspace(workspaceRoot: string, target: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(resolvedRoot, target);
  const relative = path.relative(resolvedRoot, resolved);
  // An empty relative path means the target IS the workspace root — that is
  // inside the boundary and valid (the manifest lives there).
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WorkspaceBoundsError(target);
  }
  return resolved;
}
