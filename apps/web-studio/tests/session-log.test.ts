import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_DIR, SESSION_FILE, SessionLog, TOOL_OUTCOME_UNKNOWN } from "../src/session-log.js";

let dir: string;
const logPath = (): string => path.join(dir, SESSION_DIR, SESSION_FILE);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "a8-session-log-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("SessionLog", () => {
  it("derives the conversation from the log after a restart", async () => {
    const log = new SessionLog(logPath());
    await log.append({ role: "user", content: "build a login page" });
    await log.append({ role: "assistant", content: "done" });

    const reopened = new SessionLog(logPath());
    expect(await reopened.history()).toEqual([
      { role: "user", content: "build a login page" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("reset clears the derived conversation and keeps the log append-only", async () => {
    const log = new SessionLog(logPath());
    await log.append({ role: "user", content: "old" });
    await log.reset();
    await log.append({ role: "user", content: "new" });

    const reopened = new SessionLog(logPath());
    expect(await reopened.history()).toEqual([{ role: "user", content: "new" }]);
    const raw = await readFile(logPath(), "utf8");
    expect(raw).toContain('"type":"reset"');
    expect(raw).toContain("old");
  });

  it("repairs an interrupted tool call once, with an explicit unknown outcome", async () => {
    await mkdir(path.dirname(logPath()), { recursive: true });
    const at = new Date().toISOString();
    const events = [
      { v: 1, seq: 1, at, type: "message", message: { role: "user", content: "build" } },
      {
        v: 1,
        seq: 2,
        at,
        type: "message",
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "call_1", name: "write_file", arguments: "{}" },
            { id: "call_2", name: "design_audit", arguments: "{}" },
          ],
        },
      },
      {
        v: 1,
        seq: 3,
        at,
        type: "message",
        message: { role: "tool", toolCallId: "call_1", content: "wrote index.html" },
      },
    ];
    await writeFile(logPath(), events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");

    const log = new SessionLog(logPath());
    const history = await log.history();
    expect(history).toHaveLength(4);
    expect(history[2]).toEqual({ role: "tool", toolCallId: "call_1", content: "wrote index.html" });
    expect(history[3]).toEqual({ role: "tool", toolCallId: "call_2", content: TOOL_OUTCOME_UNKNOWN });

    // The repair is durable and idempotent: a second load adds nothing.
    const reopened = new SessionLog(logPath());
    expect(await reopened.history()).toHaveLength(4);
  });

  it("ignores a torn trailing line from a crashed write", async () => {
    await mkdir(path.dirname(logPath()), { recursive: true });
    const kept = JSON.stringify({
      v: 1,
      seq: 1,
      at: new Date().toISOString(),
      type: "message",
      message: { role: "user", content: "kept" },
    });
    await writeFile(logPath(), `${kept}\n{"v":1,"seq":2,`, "utf8");

    const log = new SessionLog(logPath());
    expect(await log.history()).toEqual([{ role: "user", content: "kept" }]);
  });

  it("rolls back the last assistant turn while keeping the last user message", async () => {
    const log = new SessionLog(logPath());
    await log.append({ role: "user", content: "first" });
    await log.append({ role: "assistant", content: "reply 1" });
    await log.append({ role: "user", content: "second" });
    await log.append({ role: "assistant", content: "reply 2", toolCalls: [{ id: "c1", name: "read_file", arguments: "{}" }] });
    await log.append({ role: "tool", toolCallId: "c1", content: "ok" });

    await log.rollbackLastTurn();

    expect(await log.history()).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply 1" },
      { role: "user", content: "second" },
    ]);

    const reopened = new SessionLog(logPath());
    expect(await reopened.history()).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply 1" },
      { role: "user", content: "second" },
    ]);
  });
});
