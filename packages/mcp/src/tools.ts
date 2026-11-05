import path from "node:path";

import {
  SPEC_SNAPSHOT,
  SPEC_SUPPORTED,
  validateSpec,
  type ProjectSpec,
  type SpecIssue,
} from "./spec.js";
import { resolveWithinWorkspace, WorkspaceBoundsError } from "./bounds.js";
import { PROJECT_MANIFEST_FILENAME, readManifestSnapshot } from "./manifest.js";

/**
 * Read-only tool handlers behind the MCP surface. Handlers return plain,
 * JSON-serializable results (never throw for expected conditions) and every
 * result carries the identity block: which server, which spec snapshot, and
 * which workspace root the server is rooted to.
 *
 * There are no write tools. Future write actions must arrive with explicit
 * confirmation, receipts, and audit records per the Authenik8 MCP rules.
 */

export type McpIdentity = {
  server: "authenik8-mcp";
  specVersion: number;
  workspaceRoot: string | null;
};

export type ToolResult = Record<string, unknown>;

export type ToolHandlers = {
  getSupportedFeatures(): ToolResult;
  planProject(spec: ProjectSpec): ToolResult;
  validateSpec(spec: ProjectSpec): ToolResult;
  getProjectContract(root?: string): ToolResult;
};

export function createToolHandlers(options: { workspaceRoot?: string } = {}): ToolHandlers {
  const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : null;
  const identity: McpIdentity = {
    server: "authenik8-mcp",
    specVersion: SPEC_SNAPSHOT.specVersion,
    workspaceRoot,
  };

  return {
    getSupportedFeatures(): ToolResult {
      return { ok: true, identity, supported: SPEC_SUPPORTED, provenance: SPEC_SNAPSHOT };
    },

    planProject(spec: ProjectSpec): ToolResult {
      const validation = validateSpec(spec);
      if (!validation.valid) {
        return { ok: false, identity, issues: validation.issues };
      }
      const normalized = validation.normalized;

      const isFullstack = normalized.preset === "fullstack";
      const decisions: Record<string, unknown> = {
        projectName: normalized.projectName,
        preset: normalized.preset,
        framework: SPEC_SUPPORTED.framework[0],
        frontend: normalized.frontend ?? null,
        database: normalized.database ?? null,
        runtime: normalized.runtime ?? null,
        packageManager: normalized.packageManager ?? null,
        authMethods: normalized.authMethods ?? null,
        oauthProviders: normalized.oauthProviders ?? [],
        prisma: normalized.usePrisma ?? false,
        git: normalized.useGit ?? true,
        productionReady: normalized.productionReady ?? false,
      };

      // Flags verified against the CLI argument parser (src/lib/args.ts).
      const commandParts: string[] = [
        "npx create-authenik8-app",
        normalized.projectName,
        `--preset ${normalized.preset}`,
      ];
      if (normalized.frontend !== undefined) commandParts.push(`--frontend ${normalized.frontend}`);
      if (normalized.database !== undefined) commandParts.push(`--database ${normalized.database}`);
      if (normalized.runtime !== undefined) commandParts.push(`--runtime ${normalized.runtime}`);
      if (isFullstack) {
        // Manifest contract: fullstack requires npm workspaces.
        commandParts.push("--package-manager npm");
      } else if (normalized.packageManager !== undefined) {
        commandParts.push(`--package-manager ${normalized.packageManager}`);
      }
      if ((normalized.oauthProviders?.length ?? 0) > 0) {
        commandParts.push(`--oauth ${normalized.oauthProviders!.join(",")}`);
      }
      if (!isFullstack && normalized.usePrisma !== undefined) {
        commandParts.push(normalized.usePrisma ? "--prisma" : "--no-prisma");
      }
      if (normalized.useGit === false) commandParts.push("--no-git");
      if (normalized.productionReady === true) commandParts.push("--production-ready");
      commandParts.push("--yes");

      const notes: string[] = [
        "Plan only: nothing is generated, written, or installed by this tool.",
        "The generator decides generated file contents and engine versions at creation time; the manifest preview below lists contract fields, not generated values.",
      ];
      if (isFullstack) {
        notes.push("The fullstack preset requires npm workspaces and PostgreSQL per the manifest contract.");
      }

      const followUps = ["npx create-authenik8-app doctor"];
      if (normalized.preset === "fullstack" && normalized.frontend === "lovable") {
        followUps.push("npx create-authenik8-app doctor frontend");
      }

      const manifestShape: Array<{ field: string; value: unknown; decidedBy: "spec" | "generator" }> = [
        { field: "schemaVersion", value: 1, decidedBy: "generator" },
        { field: "preset", value: normalized.preset, decidedBy: "spec" },
        { field: "packageManager", value: isFullstack ? "npm" : normalized.packageManager ?? null, decidedBy: "spec" },
        { field: "runtime", value: normalized.runtime ?? null, decidedBy: "spec" },
        { field: "database", value: normalized.database ?? null, decidedBy: "spec" },
        { field: "features.prisma", value: normalized.usePrisma ?? false, decidedBy: "spec" },
        { field: "features.oauthProviders", value: normalized.oauthProviders ?? [], decidedBy: "spec" },
        { field: "features.pm2", value: normalized.productionReady ?? false, decidedBy: "spec" },
        { field: "features.frontend", value: normalized.frontend ?? null, decidedBy: "spec" },
        { field: "generatedBy.version", value: "set by the generator at creation time", decidedBy: "generator" },
        { field: "engine.version", value: "set by the generator at creation time", decidedBy: "generator" },
      ];

      return {
        ok: true,
        identity,
        plan: {
          summary: `Plan for an Authenik8 ${normalized.preset} project "${normalized.projectName}".`,
          decisions,
          suggestedCommand: commandParts.join(" "),
          manifestShape,
          followUps,
          notes,
        },
      };
    },

    validateSpec(spec: ProjectSpec): ToolResult {
      const validation = validateSpec(spec);
      if (!validation.valid) {
        return { ok: true, identity, valid: false, issues: validation.issues };
      }
      return { ok: true, identity, valid: true, issues: [], normalized: validation.normalized };
    },

    getProjectContract(root = "."): ToolResult {
      if (!workspaceRoot) {
        return {
          ok: false,
          identity,
          code: "no_workspace_configured",
          message: "Start the server with --workspace <dir> to enable project inspection.",
        };
      }
      let resolved: string;
      try {
        resolved = resolveWithinWorkspace(workspaceRoot, root);
      } catch (error) {
        if (error instanceof WorkspaceBoundsError) {
          return {
            ok: false,
            identity,
            code: "outside_workspace",
            message: error.message,
          };
        }
        throw error;
      }

      const read = readManifestSnapshot(resolved);
      if (read.status === "valid") {
        return { ok: true, identity, root: resolved, status: "valid", manifest: read.manifest };
      }
      if (read.status === "missing") {
        return {
          ok: true,
          identity,
          root: resolved,
          status: "missing",
          message: `No ${PROJECT_MANIFEST_FILENAME} found in the resolved directory.`,
        };
      }
      return { ok: true, identity, root: resolved, status: "invalid", message: read.message };
    },
  };
}

export type { SpecIssue };
