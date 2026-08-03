import { createRequire } from "node:module";
import path from "node:path";

type EngineExports = typeof import("authenik8-core");

export type ProjectEngine = {
  createAuthenik8(
    config: Record<string, unknown>,
  ): ReturnType<EngineExports["createAuthenik8"]>;
  generateSigningJwk: EngineExports["generateSigningJwk"];
  verifyAccessTokenWithJwks: EngineExports["verifyAccessTokenWithJwks"];
};

export type ProjectEngineExport = keyof ProjectEngine;

export function loadProjectEngine(
  appDir: string,
  requiredExports: readonly ProjectEngineExport[] = ["createAuthenik8"],
): ProjectEngine {
  const requireFromProject = createRequire(path.join(appDir, "package.json"));
  const loaded = requireFromProject("authenik8-core") as Partial<ProjectEngine>;
  const missing = requiredExports.filter(
    (name) => typeof loaded?.[name] !== "function",
  );
  if (missing.length > 0) {
    throw new Error(
      `authenik8-core is missing required root exports: ${missing.join(", ")}`,
    );
  }
  return loaded as ProjectEngine;
}
