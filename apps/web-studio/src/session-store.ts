import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { SESSION_DIR, SESSION_FILE, summarizeSession } from "./session-log.js";

/**
 * Multiple local conversations per sandbox.
 *
 * The default conversation keeps the original `.authenik8/session.jsonl` path
 * so an existing install upgrades in place. Every conversation created from
 * the session switcher lives in `.authenik8/sessions/`; the id is validated
 * before it becomes a path, so a request cannot walk outside that directory.
 */

export const SESSIONS_SUBDIR = "sessions";
export const DEFAULT_SESSION_ID = "default";

const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{5,63}$/;

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string | null;
  turns: number;
};

export type SessionIndex = {
  activeId: string;
  sessions: SessionSummary[];
};

export function isValidSessionId(id: string): boolean {
  return id === DEFAULT_SESSION_ID || SESSION_ID_PATTERN.test(id);
}

/** Absolute log path for a validated session id. Throws before path.join otherwise. */
export function sessionLogPath(sandboxRoot: string, id: string): string {
  if (!isValidSessionId(id)) throw new Error("Invalid session id");
  if (id === DEFAULT_SESSION_ID) return path.join(sandboxRoot, SESSION_DIR, SESSION_FILE);
  return path.join(sandboxRoot, SESSION_DIR, SESSIONS_SUBDIR, `${id}.jsonl`);
}

/** Create an empty conversation and return its id. The file is the index entry. */
export async function createSession(sandboxRoot: string): Promise<string> {
  const id = `s-${randomUUID()}`;
  const file = sessionLogPath(sandboxRoot, id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "", { encoding: "utf8", flag: "wx" });
  return id;
}

/** A generated session exists only after createSession wrote its file. */
export async function sessionExists(sandboxRoot: string, id: string): Promise<boolean> {
  if (!isValidSessionId(id)) return false;
  if (id === DEFAULT_SESSION_ID) return true;
  try {
    const info = await stat(sessionLogPath(sandboxRoot, id));
    return info.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Read one summary; a file that disappeared between listing and reading is omitted. */
async function readSummary(sandboxRoot: string, id: string): Promise<SessionSummary | null> {
  const file = sessionLogPath(sandboxRoot, id);
  try {
    const [raw, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    const summary = summarizeSession(raw);
    return {
      id,
      title: summary.title,
      turns: summary.turns,
      updatedAt: info.mtime.toISOString(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listSessions(sandboxRoot: string, activeId: string): Promise<SessionIndex> {
  const directory = path.join(sandboxRoot, SESSION_DIR, SESSIONS_SUBDIR);
  let entries: Dirent[] = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const id = entry.name.slice(0, -".jsonl".length);
    if (isValidSessionId(id) && id !== DEFAULT_SESSION_ID) ids.add(id);
  }
  if (await sessionExists(sandboxRoot, DEFAULT_SESSION_ID)) ids.add(DEFAULT_SESSION_ID);
  if (!ids.has(activeId) && isValidSessionId(activeId)) ids.add(activeId);

  const summaries = (await Promise.all([...ids].map((id) => readSummary(sandboxRoot, id))))
    .filter((summary): summary is SessionSummary => summary !== null);
  summaries.sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    const at = a.updatedAt === null ? 0 : Date.parse(a.updatedAt);
    const bt = b.updatedAt === null ? 0 : Date.parse(b.updatedAt);
    return bt - at || a.id.localeCompare(b.id);
  });

  return { activeId, sessions: summaries };
}
