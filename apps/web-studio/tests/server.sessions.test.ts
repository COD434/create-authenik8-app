import path from "node:path";

import { describe, expect, it } from "vitest";

import { SessionLog } from "../src/session-log.js";
import { DEFAULT_SESSION_ID, sessionLogPath } from "../src/session-store.js";
import {
  KEY,
  agentCalls,
  agentSuccess,
  base,
  resolveRun,
  sandbox,
} from "./support/studio-harness.js";

const JSON_HEADERS = { "content-type": "application/json" };

async function activate(id: string): Promise<Response> {
  return fetch(`${base}/api/sessions/activate`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ id }),
  });
}

async function index(): Promise<{
  activeId: string;
  sessions: Array<{ id: string; title: string; turns: number; updatedAt: string | null }>;
}> {
  const res = await fetch(`${base}/api/sessions`);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("no-store");
  return res.json() as Promise<{
    activeId: string;
    sessions: Array<{ id: string; title: string; turns: number; updatedAt: string | null }>;
  }>;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition was not met");
}

describe("session switcher", () => {
  it("lists the default conversation and keeps a new conversation separate", async () => {
    expect((await activate(DEFAULT_SESSION_ID)).status).toBe(200);
    const defaultLog = new SessionLog(path.join(sandbox, ".authenik8", "session.jsonl"));
    await defaultLog.reset();
    await defaultLog.append({ role: "user", content: "Ship the default conversation" });
    expect((await activate(DEFAULT_SESSION_ID)).status).toBe(200); // drop the cached log

    const defaultHistory = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(defaultHistory.messages.some((message) => message.content === "Ship the default conversation")).toBe(true);

    const first = await index();
    expect(first.activeId).toBe(DEFAULT_SESSION_ID);
    expect(first.sessions[0]).toMatchObject({ id: DEFAULT_SESSION_ID, title: "Ship the default conversation", turns: 1 });

    const created = await fetch(`${base}/api/sessions`, { method: "POST" });
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };
    expect(id).toMatch(/^s-[0-9a-f-]{36}$/);

    const emptyHistory = await (await fetch(`${base}/api/history`)).json() as { messages: unknown[] };
    expect(emptyHistory.messages).toEqual([]);

    const second = await index();
    expect(second.activeId).toBe(id);
    expect(second.sessions[0]).toMatchObject({ id, title: "New session", turns: 0 });

    // A second conversation has its own file and title; the first is untouched.
    const secondLog = new SessionLog(sessionLogPath(sandbox, id));
    await secondLog.append({ role: "user", content: "Build a second, unrelated app" });
    const third = await index();
    expect(third.sessions.find((entry) => entry.id === id)).toMatchObject({
      title: "Build a second, unrelated app",
      turns: 1,
    });
    expect(third.sessions.some((entry) => entry.id === DEFAULT_SESSION_ID)).toBe(true);
  });

  it("rejects unknown and traversal session ids without changing the active conversation", async () => {
    expect((await activate(DEFAULT_SESSION_ID)).status).toBe(200);

    const traversal = await activate("../../package");
    expect(traversal.status).toBe(400);
    expect(await traversal.json()).toEqual({ error: "Invalid session id" });

    const unknown = await activate("s-00000000-0000-4000-8000-000000000000");
    expect(unknown.status).toBe(404);

    const after = await index();
    expect(after.activeId).toBe(DEFAULT_SESSION_ID);
  });

  it("refuses to create or switch sessions while an agent run is in flight", async () => {
    expect((await activate(DEFAULT_SESSION_ID)).status).toBe(200);

    const run = fetch(`${base}/api/agent`, {
      method: "POST",
      headers: { ...JSON_HEADERS, "X-OpenRouter-Key": KEY },
      body: JSON.stringify({ prompt: "build it" }),
    }).then((res) => res.text());
    await waitFor(() => agentCalls.length > 0);

    const create = await fetch(`${base}/api/sessions`, { method: "POST" });
    expect(create.status).toBe(409);
    const switchSession = await activate(DEFAULT_SESSION_ID);
    expect(switchSession.status).toBe(409);

    resolveRun(agentSuccess);
    await run;
    expect((await activate(DEFAULT_SESSION_ID)).status).toBe(200);
  });
});
