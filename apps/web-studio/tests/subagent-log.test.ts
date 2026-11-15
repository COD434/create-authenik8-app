import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatMessage } from "@authenik8/models";

import { SESSION_DIR, SessionLog } from "../src/session-log.js";
import { SUBAGENT_DIR } from "../src/subagent.js";
import {
  CHILD_LOG_LIST_LIMIT,
  CHILD_LOG_MAX_BYTES,
  CHILD_LOG_PREVIEW_CHARS,
  listChildLogs,
  readChildLog,
} from "../src/subagent-log.js";

let sandbox: string;

const subagentDir = (): string => path.join(sandbox, SESSION_DIR, SUBAGENT_DIR);

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "a8-subagent-log-"));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});
});

async function writeChildLog(
  kind: "explore" | "review" | "build",
  messages: ChatMessage[],
): Promise<string> {
  const id = `${kind}-${randomUUID()}`;
  const log = new SessionLog(path.join(subagentDir(), `${id}.jsonl`));
  for (const message of messages) await log.append(message);
  return id;
}

describe("subagent transcript logs", () => {
  it("lists valid child logs newest first and ignores non-logs", async () => {
    const olderId = await writeChildLog("explore", [
      { role: "system", content: "explorer system" },
      { role: "user", content: "Inspect the README" },
      { role: "assistant", content: "Answer: it is a README." },
    ]);
    const newerId = await writeChildLog("build", [
      { role: "system", content: "builder system" },
      { role: "user", content: "Build the settings page" },
    ]);

    await writeFile(path.join(subagentDir(), "explore-not-a-uuid.jsonl"), "{}\n", "utf8");
    await writeFile(path.join(subagentDir(), "notes.txt"), "not a child log\n", "utf8");
    await mkdir(path.join(subagentDir(), `build-${randomUUID()}.jsonl`));

    const older = new Date(Date.now() - 60_000);
    await utimes(path.join(subagentDir(), `${olderId}.jsonl`), older, older);

    const logs = await listChildLogs(sandbox);
    expect(logs.map((log) => log.id)).toEqual([newerId, olderId]);
    expect(logs[0]).toMatchObject({
      kind: "build",
      role: "builder",
      label: "Builder",
      preview: "Build the settings page",
    });
    expect(logs[0]!.bytes).toBeGreaterThan(0);
    expect(logs[0]!.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(logs[1]).toMatchObject({
      kind: "explore",
      role: "explorer",
      label: "Explorer",
      preview: "Inspect the README",
    });
  });

  it("reads previews only for the newest list page", async () => {
    const ids: string[] = [];
    const base = Date.now() - 60 * 60_000;
    for (let index = 0; index < CHILD_LOG_LIST_LIMIT + 10; index += 1) {
      const id = await writeChildLog("explore", [
        { role: "user", content: `Task ${index}` },
      ]);
      const filePath = path.join(subagentDir(), `${id}.jsonl`);
      const at = new Date(base + index * 1000);
      await utimes(filePath, at, at);
      ids.push(id);
    }

    const calls: string[] = [];
    const logs = await listChildLogs(sandbox, {
      previewReader: async (filePath) => {
        calls.push(path.basename(filePath));
        return `preview ${path.basename(filePath)}`;
      },
    });

    const newest = ids.slice(-CHILD_LOG_LIST_LIMIT).reverse();
    expect(logs.map((log) => log.id)).toEqual(newest);
    expect(calls).toEqual(newest.map((id) => `${id}.jsonl`));
    expect(calls).not.toContain(`${ids[0]}.jsonl`);
    expect(logs.every((log) => log.preview.startsWith("preview "))).toBe(true);
  });

  it("reads a transcript without repairing an interrupted tool call", async () => {
    const id = `explore-${randomUUID()}`;
    const at = new Date().toISOString();
    const events = [
      { v: 1, seq: 1, at, type: "message", message: { role: "user", content: "Inspect the project" } },
      {
        v: 1,
        seq: 2,
        at,
        type: "message",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_read", name: "read_file", arguments: '{"path":"README.md"}' }],
        },
      },
    ];
    const filePath = path.join(subagentDir(), `${id}.jsonl`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
    const before = await readFile(filePath, "utf8");

    const transcript = await readChildLog(sandbox, id);
    expect(transcript).not.toBeNull();
    expect(transcript?.preview).toBe("Inspect the project");
    expect(transcript?.truncated).toBe(false);
    expect(transcript?.messages).toHaveLength(2);
    expect(transcript?.messages[1]?.toolCalls?.[0]?.name).toBe("read_file");

    // Reading is inspection, not recovery: the child log must stay untouched.
    expect(await readFile(filePath, "utf8")).toBe(before);
  });

  it("rejects invalid ids, missing logs, and directories with log-shaped names", async () => {
    expect(await readChildLog(sandbox, "../session.jsonl")).toBeNull();
    expect(await readChildLog(sandbox, "explore-not-a-uuid")).toBeNull();
    expect(await readChildLog(sandbox, `explore-${randomUUID()}`)).toBeNull();

    const directoryId = `build-${randomUUID()}`;
    await mkdir(path.join(subagentDir(), `${directoryId}.jsonl`), { recursive: true });
    expect(await readChildLog(sandbox, directoryId)).toBeNull();
  });

  it("rejects a junction that redirects the subagent directory", async (ctx) => {
    const outside = path.join(sandbox, "outside-subagents");
    await mkdir(outside, { recursive: true });
    const id = `explore-${randomUUID()}`;
    const at = new Date().toISOString();
    await writeFile(
      path.join(outside, `${id}.jsonl`),
      `${JSON.stringify({
        v: 1,
        seq: 1,
        at,
        type: "message",
        message: { role: "user", content: "outside secret" },
      })}\n`,
      "utf8",
    );
    await mkdir(path.join(sandbox, SESSION_DIR), { recursive: true });
    try {
      await symlink(outside, subagentDir(), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") {
        ctx.skip();
        return;
      }
      throw error;
    }

    expect(await readChildLog(sandbox, id)).toBeNull();
    expect(await listChildLogs(sandbox)).toEqual([]);
  });

  it("returns only metadata for a log above the viewer cap", async () => {
    const id = `build-${randomUUID()}`;
    const filePath = path.join(subagentDir(), `${id}.jsonl`);
    await mkdir(subagentDir(), { recursive: true });
    await writeFile(filePath, "", "utf8");
    await truncate(filePath, CHILD_LOG_MAX_BYTES + 1);

    const transcript = await readChildLog(sandbox, id);
    expect(transcript).not.toBeNull();
    expect(transcript?.truncated).toBe(true);
    expect(transcript?.messages).toEqual([]);
  });

  it("parses a builder-sized log and projects write_file bodies", async () => {
    const content = "x".repeat(250_000);
    const messages: ChatMessage[] = [
      { role: "system", content: "builder system" },
      { role: "user", content: "Write five files" },
    ];
    for (let index = 0; index < 5; index += 1) {
      const callId = `call_${index}`;
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: callId,
            name: "write_file",
            arguments: JSON.stringify({ path: `src/file-${index}.ts`, content }),
          },
        ],
      });
      messages.push({
        role: "tool",
        toolCallId: callId,
        content: `wrote src/file-${index}.ts (250000 bytes)`,
      });
    }
    messages.push({ role: "assistant", content: "Builder report: wrote 5 files." });

    const id = await writeChildLog("build", messages);
    const filePath = path.join(subagentDir(), `${id}.jsonl`);
    const rawBefore = await readFile(filePath, "utf8");
    expect(rawBefore.length).toBeGreaterThan(1024 * 1024);

    const transcript = await readChildLog(sandbox, id);
    expect(transcript).not.toBeNull();
    expect(transcript?.truncated).toBe(false);
    expect(transcript?.preview).toBe("Write five files");
    expect(transcript?.messages).toHaveLength(messages.length);

    const writeCalls = transcript?.messages.flatMap((message) => message.toolCalls ?? []) ?? [];
    const firstWrite = writeCalls.find((call) => call.name === "write_file");
    expect(firstWrite?.arguments).toContain("src/file-0.ts");
    expect(firstWrite?.arguments).toContain("content omitted: 250000 chars");
    expect(firstWrite?.arguments.length).toBeLessThan(200);
    expect(JSON.stringify(transcript).length).toBeLessThan(50_000);

    // Projection is response-only; the append-only log keeps the full bodies.
    expect(await readFile(filePath, "utf8")).toBe(rawBefore);
  });

  it("caps the task preview without reading the whole log", async () => {
    const longTask = `Task ${"x".repeat(CHILD_LOG_PREVIEW_CHARS + 40)}`;
    const id = await writeChildLog("review", [
      { role: "system", content: "reviewer system" },
      { role: "user", content: longTask },
    ]);

    const logs = await listChildLogs(sandbox);
    expect(logs[0]?.id).toBe(id);
    expect(logs[0]!.preview.length).toBeLessThanOrEqual(CHILD_LOG_PREVIEW_CHARS);
    expect(logs[0]!.preview.endsWith("...")).toBe(true);
  });
});
