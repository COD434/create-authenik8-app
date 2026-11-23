import { randomUUID } from "node:crypto";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ChatChunk } from "@authenik8/models";

import { SESSION_DIR, SessionLog } from "../src/session-log.js";
import { SUBAGENT_DIR } from "../src/subagent.js";
import {
  KEY,
  base,
  capturedRequests,
  chat,
  sandbox,
  sseToolChildId,
  state,
  textRound,
} from "./support/studio-harness.js";

describe("explorer subagent", () => {
  function toolRound(
    id: string,
    name: string,
    args: Record<string, unknown>,
  ): ChatChunk[] {
    return [
      {
        delta: null,
        toolCalls: [{ index: 0, id, name, argumentsDelta: JSON.stringify(args) }],
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
  }

  it("runs one read-only child and returns its report as a parent tool result", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });

    state.script = [
      toolRound("call_explore", "explore_project", {
        task: "Read README.md and report what the project is.",
      }),
      toolRound("child_read", "read_file", { path: "README.md" }),
      [
        {
          delta: "Answer: the project has a README. Evidence: README.md.",
          toolCalls: null,
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "stop", usage: null },
      ],
      textRound,
    ];

    const text = await (await chat("explore the project")).text();
    expect(text).toContain('"name":"explore_project"');
    expect(text).toContain("Explorer report (read-only, 2 rounds):");
    expect(text).not.toContain(KEY);
    const childId = sseToolChildId(text, "explore_project");
    expect(childId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // Parent round 1, child read, child report, parent round 2.
    expect(capturedRequests).toHaveLength(4);
    const parentTools = capturedRequests[0]!.tools?.map((tool) => tool.name) ?? [];
    expect(parentTools).toContain("explore_project");
    const childTools = capturedRequests[1]!.tools?.map((tool) => tool.name) ?? [];
    expect(childTools).toEqual(["list_files", "read_file", "design_audit", "canon_audit"]);
    // Fresh child context: system + task only, not the parent conversation.
    expect(capturedRequests[1]!.messages).toHaveLength(2);
    expect(capturedRequests[1]!.messages[0]?.role).toBe("system");
    expect(capturedRequests[1]!.messages[1]).toEqual({
      role: "user",
      content: "Read README.md and report what the project is.",
    });

    // The parent saw the report, not the raw file output.
    const parentSecond = capturedRequests[3]!;
    const explorerResult = parentSecond.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_explore",
    );
    expect(explorerResult?.content).toContain("Explorer report (read-only, 2 rounds):");
    expect(explorerResult?.content).toContain("Answer: the project has a README.");
    expect(explorerResult?.content).not.toContain("Hello from README.");

    const parentHistory = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string; toolCallId?: string; childId?: string }>;
    };
    expect(
      parentHistory.messages.some((message) => message.content.includes("Hello from README.")),
    ).toBe(false);
    const explorerHistory = parentHistory.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_explore",
    );
    expect(explorerHistory?.childId).toBe(childId);

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(1);
    expect(childFiles[0]).toBe(`explore-${childId}.jsonl`);
    const childHistory = await new SessionLog(
      path.join(sandbox, SESSION_DIR, SUBAGENT_DIR, childFiles[0]!),
    ).history();
    expect(
      childHistory.some((message) => message.content.includes("Hello from README.")),
    ).toBe(true);
    expect(
      childHistory.some(
        (message) => message.role === "assistant" && message.content.includes("Answer:"),
      ),
    ).toBe(true);
  });

  it("allows only one explorer per turn", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });

    state.script = [
      [
        {
          delta: null,
          toolCalls: [
            {
              index: 0,
              id: "call_e1",
              name: "explore_project",
              argumentsDelta: JSON.stringify({ task: "First look." }),
            },
            {
              index: 1,
              id: "call_e2",
              name: "explore_project",
              argumentsDelta: JSON.stringify({ task: "Second look." }),
            },
          ],
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
      ],
      [
        {
          delta: "Answer: first look done.",
          toolCalls: null,
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "stop", usage: null },
      ],
      textRound,
    ];

    const text = await (await chat("explore twice")).text();
    expect(text).toContain("only one explore_project call is allowed per turn");
    expect(text).not.toContain(KEY);

    // The first call ran a child; the second never reached the gateway.
    expect(capturedRequests).toHaveLength(3);
    const history = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string; toolCallId?: string }>;
    };
    const first = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_e1",
    );
    expect(first?.content).toContain("Answer: first look done.");
    const second = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_e2",
    );
    expect(second?.content).toContain("only one explore_project call is allowed per turn");

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(1);
  });
});

describe("reviewer subagent", () => {
  function toolRound(
    id: string,
    name: string,
    args: Record<string, unknown>,
  ): ChatChunk[] {
    return [
      {
        delta: null,
        toolCalls: [{ index: 0, id, name, argumentsDelta: JSON.stringify(args) }],
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
  }

  function multiToolRound(
    calls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  ): ChatChunk[] {
    return [
      {
        delta: null,
        toolCalls: calls.map((call, index) => ({
          index,
          id: call.id,
          name: call.name,
          argumentsDelta: JSON.stringify(call.args),
        })),
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
  }

  it("runs one read-only reviewer and returns findings as a parent tool result", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });

    state.script = [
      toolRound("call_review", "review_project", {
        task: "Review README.md for missing setup steps.",
      }),
      toolRound("child_read", "read_file", { path: "README.md" }),
      [
        {
          delta: "High: README has no setup steps. Evidence: README.md.",
          toolCalls: null,
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "stop", usage: null },
      ],
      textRound,
    ];

    const text = await (await chat("review the project")).text();
    expect(text).toContain('"name":"review_project"');
    expect(text).toContain("Reviewer report (read-only, 2 rounds):");
    expect(text).not.toContain(KEY);

    expect(capturedRequests).toHaveLength(4);
    const parentTools = capturedRequests[0]!.tools?.map((tool) => tool.name) ?? [];
    expect(parentTools).toContain("explore_project");
    expect(parentTools).toContain("review_project");
    const childTools = capturedRequests[1]!.tools?.map((tool) => tool.name) ?? [];
    expect(childTools).toEqual(["list_files", "read_file", "design_audit", "canon_audit"]);
    expect(capturedRequests[1]!.messages).toHaveLength(2);
    expect(capturedRequests[1]!.messages[0]?.role).toBe("system");
    expect(capturedRequests[1]!.messages[0]?.content).toContain("read-only reviewer");
    expect(capturedRequests[1]!.messages[0]?.content).toContain("findings ordered by severity");
    expect(capturedRequests[1]!.messages[1]).toEqual({
      role: "user",
      content: "Review README.md for missing setup steps.",
    });

    const parentSecond = capturedRequests[3]!;
    const reviewResult = parentSecond.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_review",
    );
    expect(reviewResult?.content).toContain("Reviewer report (read-only, 2 rounds):");
    expect(reviewResult?.content).toContain("High: README has no setup steps.");
    expect(reviewResult?.content).not.toContain("Hello from README.");

    const parentHistory = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ content: string }>;
    };
    expect(
      parentHistory.messages.some((message) => message.content.includes("Hello from README.")),
    ).toBe(false);

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(1);
    expect(childFiles[0]).toMatch(/^review-/);
    const childHistory = await new SessionLog(
      path.join(sandbox, SESSION_DIR, SUBAGENT_DIR, childFiles[0]!),
    ).history();
    expect(
      childHistory.some((message) => message.content.includes("Hello from README.")),
    ).toBe(true);
  });

  it("shares the one-child-per-turn limit across delegation tools", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });

    state.script = [
      multiToolRound([
        { id: "call_e1", name: "explore_project", args: { task: "First look." } },
        { id: "call_r2", name: "review_project", args: { task: "Review it." } },
        { id: "call_b3", name: "build_project", args: { directory: "src", task: "Build it." } },
      ]),
      [
        {
          delta: "Answer: first look done.",
          toolCalls: null,
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "stop", usage: null },
      ],
      textRound,
    ];

    const text = await (await chat("explore then review then build")).text();
    expect(text).toContain("only one review_project call is allowed per turn");
    expect(text).toContain("only one build_project call is allowed per turn");
    expect(text).not.toContain(KEY);

    expect(capturedRequests).toHaveLength(3);
    const history = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string; toolCallId?: string }>;
    };
    const first = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_e1",
    );
    expect(first?.content).toContain("Answer: first look done.");
    const second = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_r2",
    );
    expect(second?.content).toContain("only one review_project call is allowed per turn");
    const third = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_b3",
    );
    expect(third?.content).toContain("only one build_project call is allowed per turn");

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(1);
    expect(childFiles[0]).toMatch(/^explore-/);
  });

  it("does not consume the turn when the review task is invalid", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });

    state.script = [
      multiToolRound([
        { id: "call_bad_review", name: "review_project", args: { task: "   " } },
        { id: "call_good_explore", name: "explore_project", args: { task: "Look at README." } },
      ]),
      toolRound("child_read", "read_file", { path: "README.md" }),
      [
        {
          delta: "Answer: README exists. Evidence: README.md.",
          toolCalls: null,
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "stop", usage: null },
      ],
      textRound,
    ];

    const text = await (await chat("review with an empty task then explore")).text();
    expect(text).toContain("review_project needs a JSON object");
    expect(text).toContain("Explorer report (read-only, 2 rounds):");
    expect(text).not.toContain(KEY);

    expect(capturedRequests).toHaveLength(4);
    const history = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string; toolCallId?: string }>;
    };
    const bad = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_bad_review",
    );
    expect(bad?.content).toContain("review_project needs a JSON object");
    const good = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_good_explore",
    );
    expect(good?.content).toContain("Explorer report (read-only, 2 rounds):");

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(1);
    expect(childFiles[0]).toMatch(/^explore-/);
  });
});

describe("builder subagent", () => {
  function toolRound(
    id: string,
    name: string,
    args: Record<string, unknown>,
  ): ChatChunk[] {
    return [
      {
        delta: null,
        toolCalls: [{ index: 0, id, name, argumentsDelta: JSON.stringify(args) }],
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
  }

  function multiToolRound(
    calls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  ): ChatChunk[] {
    return [
      {
        delta: null,
        toolCalls: calls.map((call, index) => ({
          index,
          id: call.id,
          name: call.name,
          argumentsDelta: JSON.stringify(call.args),
        })),
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
  }

  function textReply(text: string): ChatChunk[] {
    return [
      { delta: text, toolCalls: null, finishReason: null, usage: null },
      { delta: null, toolCalls: null, finishReason: "stop", usage: null },
    ];
  }

  it("writes inside the lease and releases it for the next turn", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });
    await rm(path.join(sandbox, "src"), { recursive: true, force: true });

    state.script = [
      toolRound("call_build_1", "build_project", {
        directory: "src",
        task: "Create src/a.ts.",
      }),
      toolRound("child_write_1", "write_file", {
        path: "src/a.ts",
        content: "export const a = 1;\n",
      }),
      textReply("Created src/a.ts."),
      textRound,
      toolRound("call_build_2", "build_project", {
        directory: "src",
        task: "Create src/b.ts.",
      }),
      toolRound("child_write_2", "write_file", {
        path: "src/b.ts",
        content: "export const b = 2;\n",
      }),
      textReply("Created src/b.ts."),
      textRound,
    ];

    const firstText = await (await chat("build src/a.ts")).text();
    expect(firstText).toContain('"name":"build_project"');
    expect(firstText).toContain("Builder report (write, 2 rounds):");
    expect(firstText).not.toContain(KEY);
    const buildChildId = sseToolChildId(firstText, "build_project");
    expect(buildChildId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const secondText = await (await chat("build src/b.ts")).text();
    expect(secondText).toContain("Builder report (write, 2 rounds):");
    expect(secondText).not.toContain(KEY);

    // Parent 1, child 1 write, child 1 report, parent 1 final,
    // parent 2, child 2 write, child 2 report, parent 2 final.
    expect(capturedRequests).toHaveLength(8);
    const parentTools = capturedRequests[0]!.tools?.map((tool) => tool.name) ?? [];
    expect(parentTools).toContain("build_project");
    expect(parentTools).toContain("explore_project");
    expect(parentTools).toContain("review_project");

    const childTools = capturedRequests[1]!.tools?.map((tool) => tool.name) ?? [];
    expect(childTools).toEqual(["list_files", "read_file", "write_file", "design_audit", "canon_audit"]);
    expect(capturedRequests[1]!.messages).toHaveLength(2);
    expect(capturedRequests[1]!.messages[0]?.role).toBe("system");
    expect(capturedRequests[1]!.messages[0]?.content).toContain("write-capable builder");
    expect(capturedRequests[1]!.messages[0]?.content).toContain('leased directory "src"');
    expect(capturedRequests[1]!.messages[1]).toEqual({
      role: "user",
      content: "Create src/a.ts.",
    });

    const firstParentSecond = capturedRequests[3]!;
    const firstResult = firstParentSecond.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_build_1",
    );
    expect(firstResult?.content).toContain("Builder report (write, 2 rounds):");
    expect(firstResult?.content).toContain("Files written: src/a.ts");
    expect(firstResult?.content).not.toContain("export const a = 1;");

    const secondParentSecond = capturedRequests[7]!;
    const secondResult = secondParentSecond.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_build_2",
    );
    expect(secondResult?.content).toContain("Builder report (write, 2 rounds):");
    expect(secondResult?.content).toContain("Files written: src/b.ts");
    expect(secondResult?.content).not.toContain("export const b = 2;");

    expect(await readFile(path.join(sandbox, "src", "a.ts"), "utf8")).toBe(
      "export const a = 1;\n",
    );
    expect(await readFile(path.join(sandbox, "src", "b.ts"), "utf8")).toBe(
      "export const b = 2;\n",
    );

    const parentHistory = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string; toolCallId?: string; childId?: string }>;
    };
    expect(
      parentHistory.messages.some((message) => message.content.includes("export const a = 1;")),
    ).toBe(false);
    expect(
      parentHistory.messages.some((message) => message.content.includes("export const b = 2;")),
    ).toBe(false);
    const built = parentHistory.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_build_1",
    );
    expect(built?.childId).toBe(buildChildId);

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(2);
    expect(childFiles.every((file) => file.startsWith("build-"))).toBe(true);
    expect(childFiles).toContain(`build-${buildChildId}.jsonl`);
    const childLog = await readFile(
      path.join(sandbox, SESSION_DIR, SUBAGENT_DIR, childFiles[0]!),
      "utf8",
    );
    expect(childLog).toContain("export const");
  }, 15_000);

  it("does not consume the turn when the lease directory escapes the sandbox", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });

    state.script = [
      multiToolRound([
        {
          id: "call_bad_build",
          name: "build_project",
          args: { directory: "../outside", task: "Build it." },
        },
        {
          id: "call_good_explore",
          name: "explore_project",
          args: { task: "Look at README." },
        },
      ]),
      toolRound("child_read", "read_file", { path: "README.md" }),
      textReply("Answer: README exists. Evidence: README.md."),
      textRound,
    ];

    const text = await (await chat("build outside then explore")).text();
    expect(text).toContain("build_project could not start");
    expect(text).toContain("must stay inside the project");
    expect(text).toContain("Explorer report (read-only, 2 rounds):");
    expect(text).not.toContain(KEY);

    expect(capturedRequests).toHaveLength(4);
    const history = await (await fetch(`${base}/api/history`)).json() as {
      messages: Array<{ role: string; content: string; toolCallId?: string }>;
    };
    const bad = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_bad_build",
    );
    expect(bad?.content).toContain("build_project could not start");
    expect(bad?.content).toContain("must stay inside the project");
    const good = history.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_good_explore",
    );
    expect(good?.content).toContain("Explorer report (read-only, 2 rounds):");

    const childFiles = await readdir(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR));
    expect(childFiles).toHaveLength(1);
    expect(childFiles[0]).toMatch(/^explore-/);
  });
});

describe("subagent transcript viewer", () => {
  it("lists and reads a child transcript with no-store", async () => {
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });
    const id = `build-${randomUUID()}`;
    const log = new SessionLog(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR, `${id}.jsonl`));
    await log.append({ role: "system", content: "builder system" });
    await log.append({ role: "user", content: "Build the settings page" });
    await log.append({ role: "assistant", content: "Files written: src/settings.ts" });

    const listRes = await fetch(`${base}/api/subagents`);
    expect(listRes.status).toBe(200);
    expect(listRes.headers.get("cache-control")).toContain("no-store");
    const list = await listRes.json() as {
      logs: Array<{ id: string; kind: string; preview: string; label: string }>;
    };
    expect(list.logs).toHaveLength(1);
    expect(list.logs[0]).toMatchObject({
      id,
      kind: "build",
      label: "Builder",
      preview: "Build the settings page",
    });

    const transcriptRes = await fetch(`${base}/api/subagents/${id}`);
    expect(transcriptRes.status).toBe(200);
    expect(transcriptRes.headers.get("cache-control")).toContain("no-store");
    const transcript = await transcriptRes.json() as {
      messages: Array<{ role: string; content: string }>;
      truncated: boolean;
    };
    expect(transcript.truncated).toBe(false);
    expect(transcript.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
    expect(transcript.messages[1]?.content).toBe("Build the settings page");
  });

  it("rejects unknown and traversal ids without reading another file", async () => {
    await rm(path.join(sandbox, SESSION_DIR, SUBAGENT_DIR), { recursive: true, force: true });
    expect((await fetch(`${base}/api/subagents/explore-${randomUUID()}`)).status).toBe(404);
    expect((await fetch(`${base}/api/subagents/..%2F..%2Fsession.jsonl`)).status).toBe(404);
    expect((await fetch(`${base}/api/subagents/explore-not-a-uuid`)).status).toBe(404);
  });
});

