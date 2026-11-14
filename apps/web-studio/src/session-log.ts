import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChatMessage } from "@authenik8/models";

/**
 * Append-only JSONL session log, adapted from the DeepSeek Harness session
 * architecture:
 *
 * - the log is the source of truth; the conversation the model sees is
 *   derived from it, so a turn survives a restart and can be inspected;
 * - every accepted message is appended before the next request derives from
 *   it (model-visible equals logged);
 * - loading repairs an interrupted turn by appending a synthetic tool result
 *   for every call whose outcome was never recorded.
 *
 * The log lives inside the sandbox at `.authenik8/session.jsonl`. It is local
 * only: preview, export, and the file tools all exclude that directory.
 */

export const SESSION_DIR = ".authenik8";
export const SESSION_FILE = "session.jsonl";

/** Model-facing result for a tool call that was dispatched but never settled. */
export const TOOL_OUTCOME_UNKNOWN =
  "Error: this tool call was interrupted before its result was recorded. Its outcome is unknown. Check the project state before retrying a side-effecting operation.";

type MessageEvent = {
  v: 1;
  seq: number;
  at: string;
  type: "message";
  message: ChatMessage;
};

type ResetEvent = {
  v: 1;
  seq: number;
  at: string;
  type: "reset";
};

type StoredEvent = MessageEvent | ResetEvent;

type EventInput =
  | { type: "message"; message: ChatMessage }
  | { type: "reset" };

function isStoredEvent(value: unknown): value is StoredEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (event.v !== 1 || typeof event.seq !== "number" || typeof event.at !== "string") return false;
  if (event.type === "reset") return true;
  if (event.type !== "message") return false;
  if (typeof event.message !== "object" || event.message === null) return false;
  const message = event.message as Record<string, unknown>;
  return typeof message.role === "string" && typeof message.content === "string";
}

function parseStoredLog(raw: string): { messages: ChatMessage[]; seq: number } {
  const messages: ChatMessage[] = [];
  let seq = 0;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // A torn tail line from a crash is ignored, not fatal.
    }
    if (!isStoredEvent(parsed)) continue;
    seq = Math.max(seq, parsed.seq);
    if (parsed.type === "reset") {
      messages.length = 0;
    } else {
      messages.push(parsed.message);
    }
  }
  return { messages, seq };
}

/**
 * Read a log without repairing it. A transcript viewer must be able to inspect
 * an interrupted child without writing a synthetic result into that child's
 * append-only log.
 */
export async function readSessionMessages(filePath: string): Promise<ChatMessage[]> {
  const raw = await readFile(filePath, "utf8");
  return parseStoredLog(raw).messages;
}

export class SessionLog {
  private messages: ChatMessage[] = [];
  private seq = 0;
  private loaded: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  /** Read the log once; concurrent callers share the same load. */
  async ensureLoaded(): Promise<void> {
    if (this.loaded === null) {
      this.loaded = this.load().catch((error: unknown) => {
        this.loaded = null; // A later request may retry after a transient read failure.
        throw error;
      });
    }
    return this.loaded;
  }

  /** The model-visible conversation, derived from the log. */
  async history(): Promise<ChatMessage[]> {
    await this.ensureLoaded();
    return this.messages.slice();
  }

  /** Append one accepted message, then resolve once it is on disk. */
  async append(message: ChatMessage): Promise<void> {
    await this.ensureLoaded();
    this.messages.push(message);
    await this.enqueue({ type: "message", message });
  }

  /** Start a new conversation; the file keeps its earlier audit trail. */
  async reset(): Promise<void> {
    await this.ensureLoaded();
    this.messages.length = 0;
    await this.enqueue({ type: "reset" });
  }

  private async load(): Promise<void> {
    let raw = "";
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    const parsed = parseStoredLog(raw);
    this.messages = parsed.messages;
    this.seq = parsed.seq;

    // Repair at the storage boundary, as the harness does: an assistant tool
    // call with no result would make every later request invalid, so the
    // missing outcomes are recorded as explicit unknowns.
    for (const message of this.pendingToolResults()) {
      this.messages.push(message);
      await this.enqueue({ type: "message", message });
    }
  }

  private pendingToolResults(): ChatMessage[] {
    const answered = new Set<string>();
    for (const message of this.messages) {
      if (message.role === "tool" && message.toolCallId !== undefined) answered.add(message.toolCallId);
    }
    const pending: ChatMessage[] = [];
    for (const message of this.messages) {
      if (message.role !== "assistant" || message.toolCalls === undefined) continue;
      for (const call of message.toolCalls) {
        if (answered.has(call.id)) continue;
        answered.add(call.id);
        pending.push({ role: "tool", toolCallId: call.id, content: TOOL_OUTCOME_UNKNOWN });
      }
    }
    return pending;
  }

  private enqueue(input: EventInput): Promise<void> {
    const base = { v: 1 as const, seq: ++this.seq, at: new Date().toISOString() };
    const event: StoredEvent = input.type === "message"
      ? { ...base, type: "message", message: input.message }
      : { ...base, type: "reset" };
    const line = `${JSON.stringify(event)}\n`;
    const write = this.writes.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, line, { encoding: "utf8", flag: "a" });
    });
    // Keep the chain alive after a failure so one bad write cannot wedge every
    // later append; the caller still sees the rejection.
    this.writes = write.catch(() => {});
    return write;
  }
}
