import type { Dirent, Stats } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { ChatMessage } from "@authenik8/models";

import { SESSION_DIR, readSessionMessages } from "./session-log.js";
import { SUBAGENT_DIR } from "./subagent.js";

/**
 * Read-only access to child transcripts.
 *
 * Child logs are append-only JSONL files under `.authenik8/subagents/`. The
 * viewer must never be able to turn an id into an arbitrary file read, so ids
 * are matched against the exact kind + UUID shape the child runner writes, and
 * the resolved file is re-checked against the real subagent directory.
 */

export const CHILD_LOG_MAX_BYTES = 1024 * 1024;
export const CHILD_LOG_LIST_LIMIT = 50;
export const CHILD_LOG_PREVIEW_CHARS = 120;
const CHILD_LOG_HEAD_BYTES = 8 * 1024;

const CHILD_LOG_ID =
  /^(explore|review|build)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ChildKind = "explore" | "review" | "build";
export type ChildRole = "explorer" | "reviewer" | "builder";

type ChildMeta = {
  role: ChildRole;
  label: "Explorer" | "Reviewer" | "Builder";
};

const CHILD_META: Record<ChildKind, ChildMeta> = {
  explore: { role: "explorer", label: "Explorer" },
  review: { role: "reviewer", label: "Reviewer" },
  build: { role: "builder", label: "Builder" },
};

export type ChildLogSummary = {
  /** The full file stem, e.g. `build-<uuid>`. */
  id: string;
  kind: ChildKind;
  role: ChildRole;
  label: string;
  bytes: number;
  modifiedAt: string;
  /** First user task, normalized and capped for the list. */
  preview: string;
};

export type ChildTranscript = ChildLogSummary & {
  messages: ChatMessage[];
  /** True when the log exceeds CHILD_LOG_MAX_BYTES and was not parsed. */
  truncated: boolean;
};

function kindFromId(id: string): ChildKind | null {
  const match = CHILD_LOG_ID.exec(id);
  return match === null ? null : (match[1] as ChildKind);
}

function previewText(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= CHILD_LOG_PREVIEW_CHARS) return text;
  return `${text.slice(0, CHILD_LOG_PREVIEW_CHARS - 3)}...`;
}

function previewFromMessages(messages: ChatMessage[]): string {
  const task = messages.find((message) => message.role === "user");
  return task === undefined ? "" : previewText(task.content);
}

async function readHead(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(CHILD_LOG_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Read the first user task without loading a potentially large transcript.
 * A partial trailing line is ignored by JSON.parse, as in the session log.
 */
async function readPreview(filePath: string): Promise<string> {
  const head = await readHead(filePath);
  for (const line of head.split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const event = parsed as { type?: unknown; message?: { role?: unknown; content?: unknown } };
    if (event.type !== "message" || event.message?.role !== "user") continue;
    if (typeof event.message.content !== "string") continue;
    return previewText(event.message.content);
  }
  return "";
}

function metaFor(kind: ChildKind): ChildMeta {
  return CHILD_META[kind];
}

function childLogDir(sandboxRoot: string): string {
  return path.join(sandboxRoot, SESSION_DIR, SUBAGENT_DIR);
}

/**
 * List valid child logs, newest first. Invalid names, directories, and
 * symlinks are skipped; a missing directory is an empty list, not an error.
 */
export async function listChildLogs(sandboxRoot: string): Promise<ChildLogSummary[]> {
  const dir = childLogDir(sandboxRoot);
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const logs: ChildLogSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const id = entry.name.slice(0, -".jsonl".length);
    const kind = kindFromId(id);
    if (kind === null) continue;

    const filePath = path.join(dir, entry.name);
    let info: Stats;
    try {
      info = await stat(filePath);
    } catch {
      continue; // A file removed between readdir and stat is not an error.
    }
    if (!info.isFile()) continue;

    const meta = metaFor(kind);
    logs.push({
      id,
      kind,
      role: meta.role,
      label: meta.label,
      bytes: info.size,
      modifiedAt: info.mtime.toISOString(),
      preview: await readPreview(filePath).catch(() => ""),
    });
  }

  logs.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return logs.slice(0, CHILD_LOG_LIST_LIMIT);
}

/**
 * Read one child transcript. Returns null for an invalid id, a missing file,
 * or a path that escapes the real subagent directory. Never writes to the log.
 */
export async function readChildLog(
  sandboxRoot: string,
  id: string,
): Promise<ChildTranscript | null> {
  const kind = kindFromId(id);
  if (kind === null) return null;

  const dir = childLogDir(sandboxRoot);
  const filePath = path.join(dir, `${id}.jsonl`);

  let info: Stats;
  try {
    info = await stat(filePath);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;

  // Defense in depth: a symlink or a replaced directory must not turn a
  // validated id into a read outside `.authenik8/subagents`.
  try {
    const [realDir, realFile] = await Promise.all([realpath(dir), realpath(filePath)]);
    const relative = path.relative(realDir, realFile);
    if (relative !== `${id}.jsonl` || relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }
  } catch {
    return null;
  }

  const meta = metaFor(kind);
  const summary: ChildLogSummary = {
    id,
    kind,
    role: meta.role,
    label: meta.label,
    bytes: info.size,
    modifiedAt: info.mtime.toISOString(),
    preview: "",
  };

  if (info.size > CHILD_LOG_MAX_BYTES) {
    return {
      ...summary,
      preview: await readPreview(filePath).catch(() => ""),
      messages: [],
      truncated: true,
    };
  }

  const messages = await readSessionMessages(filePath);
  return {
    ...summary,
    preview: previewFromMessages(messages),
    messages,
    truncated: false,
  };
}
