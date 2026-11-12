import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { formatFindings, runDesignChecks } from "@authenik8/design";
import type { ToolDefinition } from "@authenik8/models";

import { PLAN_MAX_STEPS, PLAN_MAX_TITLE_CHARS, planArgsSchema, summarizePlan } from "./plan.js";

/**
 * Sandboxed file tools for the studio agent loop.
 *
 * Scope discipline: every path a model supplies is resolved against the
 * sandbox root and rejected unless it stays inside it. Absolute and
 * drive-rooted forms are rejected BEFORE resolution (on Windows,
 * `path.resolve("C:\\sb", "/x")` escapes to "C:\\x"), and the resolved
 * result is re-verified. Tool results are size-capped before being fed
 * back to the model.
 */

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_TOOL_RESULT_CHARS = 16_000;
export const MAX_LIST_ENTRIES = 500;
/**
 * Studio-owned state (the durable session log) is not part of the project:
 * the model may neither read nor overwrite it, and listings skip it.
 */
export const RESERVED_DIR = ".authenik8";

export type ToolOutcome = {
  ok: boolean;
  /** JSON-ish text fed back to the model as the tool result. */
  result: string;
};

const listArgsSchema = z.object({ path: z.string().max(200).optional() });
const readArgsSchema = z.object({ path: z.string().min(1).max(200) });
const writeArgsSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().max(300_000),
});
const auditArgsSchema = z.object({ path: z.string().max(200).optional() });

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "list_files",
    description:
      "List every file in the sandbox project as relative paths. Call this first to see the project state.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Sub-directory to list; defaults to the project root." } },
    },
  },
  {
    name: "read_file",
    description: "Read a text file from the sandbox project. Path is relative to the project root.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File to read, relative to the project root." } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Create or overwrite a text file in the sandbox project. Path is relative to the project root; parent directories are created automatically.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File to write, relative to the project root." },
        content: { type: "string", description: "Full file contents (UTF-8 text)." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "design_audit",
    description:
      "Run the Authenik8 design-system checks (A8-DS-001 schema, A8-DS-002 required token groups, A8-DS-003 WCAG AA contrast, A8-DS-004 DESIGN.md sync) on a design directory containing tokens.json. Run this after writing or changing design tokens, and fix every failed check.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Design-system directory relative to the project root; defaults to 'design'.",
        },
      },
    },
  },
  {
    name: "update_plan",
    description:
      "Record or update a short plan for a multi-step build. Call this once before writing a multi-file project, then again when a step starts or completes. Keep 3 to 8 outcome-focused steps. The plan is shown to the user; this tool does not execute anything.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "Ordered plan steps, at most 8.",
          minItems: 1,
          maxItems: PLAN_MAX_STEPS,
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Short step title, at most 120 characters.",
                minLength: 1,
                maxLength: PLAN_MAX_TITLE_CHARS,
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
                description: "Current state of the step.",
              },
            },
            required: ["title", "status"],
          },
        },
      },
      required: ["steps"],
    },
  },
];

/**
 * Resolve a model-supplied path inside the sandbox, or null when it tries
 * to escape. Rejects absolute/rooted forms before resolution and re-verifies
 * the resolved location afterwards.
 */
export function resolveInsideSandbox(sandboxRoot: string, requested: string): string | null {
  const trimmed = requested.trim();
  if (trimmed === "" || path.isAbsolute(trimmed)) return null;
  const resolved = path.resolve(sandboxRoot, trimmed);
  const relative = path.relative(sandboxRoot, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const first = relative.split(path.sep)[0];
  if (first !== undefined && first.toLowerCase() === RESERVED_DIR) return null;
  return resolved;
}

function truncate(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result;
  return `${result.slice(0, MAX_TOOL_RESULT_CHARS)}\n...[truncated]`;
}

async function walk(root: string, dir: string, out: string[], depth: number): Promise<void> {
  if (out.length >= MAX_LIST_ENTRIES || depth > 8) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= MAX_LIST_ENTRIES) return;
    const name = entry.name.toLowerCase();
    if (name === "node_modules" || name === ".git" || name === RESERVED_DIR) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, out, depth + 1);
    } else {
      out.push(path.relative(root, full));
    }
  }
}

/** Execute one tool call. Never throws: failures are data for the model. */
export async function executeTool(
  name: string,
  argumentsJson: string,
  sandboxRoot: string,
): Promise<ToolOutcome> {
  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(argumentsJson);
  } catch {
    return { ok: false, result: "Error: tool arguments were not valid JSON." };
  }

  try {
    if (name === "update_plan") {
      const args = planArgsSchema.parse(parsedArguments);
      return { ok: true, result: summarizePlan({ steps: args.steps }) };
    }

    if (name === "list_files") {
      const args = listArgsSchema.parse(parsedArguments ?? {});
      const dir = args.path === undefined || args.path === "." || args.path === ""
        ? sandboxRoot
        : resolveInsideSandbox(sandboxRoot, args.path);
      if (dir === null) return { ok: false, result: "Error: path escapes the project sandbox." };
      const files: string[] = [];
      await walk(sandboxRoot, dir, files, 0);
      return { ok: true, result: truncate(JSON.stringify({ files: files.sort() })) };
    }

    if (name === "read_file") {
      const args = readArgsSchema.parse(parsedArguments);
      const file = resolveInsideSandbox(sandboxRoot, args.path);
      if (file === null) return { ok: false, result: "Error: path escapes the project sandbox." };
      const content = await readFile(file, "utf8");
      if (content.length > MAX_FILE_BYTES) {
        return { ok: false, result: `Error: file is larger than ${MAX_FILE_BYTES} bytes.` };
      }
      return { ok: true, result: truncate(content) };
    }

    if (name === "write_file") {
      const args = writeArgsSchema.parse(parsedArguments);
      const file = resolveInsideSandbox(sandboxRoot, args.path);
      if (file === null) return { ok: false, result: "Error: path escapes the project sandbox." };
      if (Buffer.byteLength(args.content, "utf8") > MAX_FILE_BYTES) {
        return { ok: false, result: `Error: content exceeds ${MAX_FILE_BYTES} bytes.` };
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, args.content, "utf8");
      return { ok: true, result: `wrote ${args.path} (${Buffer.byteLength(args.content, "utf8")} bytes)` };
    }

    if (name === "design_audit") {
      const args = auditArgsSchema.parse(parsedArguments ?? {});
      const requested = args.path === undefined || args.path.trim() === "" ? "design" : args.path;
      const target = resolveInsideSandbox(sandboxRoot, requested);
      if (target === null) return { ok: false, result: "Error: path escapes the project sandbox." };
      // runDesignChecks never throws for load/validation problems — they come
      // back as A8-DS-001 fail findings so the model can repair the bundle.
      const result = await runDesignChecks(target);
      return { ok: result.ok, result: truncate(formatFindings(result)) };
    }

    return { ok: false, result: `Error: unknown tool "${name}".` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tool failed";
    if (error instanceof z.ZodError) {
      return { ok: false, result: `Error: invalid tool arguments: ${error.issues[0]?.message ?? message}` };
    }
    return { ok: false, result: `Error: ${message}` };
  }
}
