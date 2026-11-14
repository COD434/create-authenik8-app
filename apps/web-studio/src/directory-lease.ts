import { randomUUID } from "node:crypto";
import path from "node:path";

import { RESERVED_DIR, resolveInsideSandbox } from "./tools.js";

/**
 * In-memory directory leases for write-capable child agents.
 *
 * A lease is a single-writer reservation on one sandbox-relative directory.
 * Overlapping leases are rejected, so two children can never write the same
 * path. Leases are process-local and released when the child ends; they are
 * not a durable lock across server restarts.
 */

export type SandboxLease = {
  id: string;
  /** Absolute, resolved directory the child may write inside. */
  root: string;
  /** Sandbox-relative directory with forward slashes ("." for the root). */
  relativeRoot: string;
};

export type LeaseResult =
  | { ok: true; lease: SandboxLease }
  | { ok: false; error: string };

export type LeaseManager = {
  acquire(sandboxRoot: string, relativeDir: string): LeaseResult;
  release(lease: SandboxLease): void;
  active(): SandboxLease[];
};

const SENSITIVE_COMPONENTS = new Set([RESERVED_DIR, ".git", "node_modules"]);

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function overlaps(a: string, b: string): boolean {
  return contains(a, b) || contains(b, a);
}

function toRelative(root: string, target: string): string {
  const relative = path.relative(root, target);
  return relative === "" ? "." : relative.split(path.sep).join("/");
}

export function createLeaseManager(): LeaseManager {
  const leases: SandboxLease[] = [];

  return {
    acquire(sandboxRoot, relativeDir) {
      const root = path.resolve(sandboxRoot);
      const trimmed = relativeDir.trim();
      if (trimmed === "") {
        return { ok: false, error: "directory must not be empty." };
      }

      const normalized = trimmed.replace(/[\\/]+$/, "");
      let target: string;
      let relativeRoot: string;
      if (normalized === ".") {
        target = root;
        relativeRoot = ".";
      } else {
        const resolved = resolveInsideSandbox(root, normalized);
        if (resolved === null) {
          return { ok: false, error: "directory must stay inside the project." };
        }
        target = resolved;
        relativeRoot = toRelative(root, resolved);
      }

      const components = relativeRoot === "." ? [] : relativeRoot.split("/");
      if (components.some((component) => SENSITIVE_COMPONENTS.has(component.toLowerCase()))) {
        return {
          ok: false,
          error: "directory is reserved for studio state, dependencies, or Git metadata.",
        };
      }
      if (
        components.some(
          (component) =>
            component.toLowerCase().startsWith(".env") &&
            component.toLowerCase() !== ".env.example",
        )
      ) {
        return { ok: false, error: "directory cannot be an environment path." };
      }

      const conflict = leases.find((lease) => overlaps(lease.root, target));
      if (conflict !== undefined) {
        return {
          ok: false,
          error: `directory overlaps a lease already held on "${conflict.relativeRoot}".`,
        };
      }

      const lease: SandboxLease = { id: randomUUID(), root: target, relativeRoot };
      leases.push(lease);
      return { ok: true, lease };
    },

    release(lease) {
      const index = leases.findIndex((held) => held.id === lease.id);
      if (index !== -1) leases.splice(index, 1);
    },

    active() {
      return leases.map((lease) => ({ ...lease }));
    },
  };
}
