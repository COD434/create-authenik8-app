import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createWebStudioServer } from "../src/server.js";
import { SessionLog } from "../src/session-log.js";
import {
  KEY,
  base,
  capturedRequests,
  chat,
  deps,
  fakeRunner,
  sandbox,
  state,
  textRound,
} from "./support/studio-harness.js";

describe("agent loop", () => {
  it("executes tool calls and continues to a second round with the tool result", async () => {
    state.script = [
      [
        { delta: "I'll create the file.", toolCalls: null, finishReason: null, usage: null },
        {
          delta: null,
          toolCalls: [{
            index: 0,
            id: "call_1",
            name: "write_file",
            argumentsDelta: JSON.stringify({ path: "hello.txt", content: "hello from the loop" }),
          }],
          finishReason: null,
          usage: null,
        },
        {
          delta: null,
          toolCalls: null,
          finishReason: "tool_calls",
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, costUsd: null },
        },
      ],
      textRound,
    ];

    const res = await chat("create hello.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    expect(text).toContain('"delta":"I\'ll create the file."');
    expect(text).not.toContain('"thinking"');
    expect(text).toContain('"round":1');
    expect(text).toContain('"round":2');
    expect(text).toContain('"phase":"start"');
    expect(text).toContain('"phase":"done"');
    expect(text).toContain('"ok":true');
    expect(text).toContain('"done":true');
    expect(text).not.toContain(KEY);

    // The tool really wrote the file inside the sandbox.
    expect(await readFile(path.join(sandbox, "hello.txt"), "utf8")).toBe("hello from the loop");

    // Round 2 saw the assistant tool call, the tool result, and a refreshed
    // runtime context that now includes the file the tool created.
    expect(capturedRequests).toHaveLength(2);
    const second = capturedRequests[1]!;
    const toolMessage = second.messages.find((message) => message.role === "tool");
    expect(toolMessage?.toolCallId).toBe("call_1");
    expect(toolMessage?.content).toContain("wrote hello.txt");
    const assistantMessage = second.messages.find((message) => message.role === "assistant");
    expect(assistantMessage?.toolCalls?.[0]?.name).toBe("write_file");
    const contexts = second.messages.filter(
      (message) => message.role === "system" && message.content.startsWith("<runtime-context>"),
    );
    expect(contexts).toHaveLength(2);
    expect(contexts.at(-1)?.content).toContain("hello.txt");
  });

  it("feeds tool failures back to the model instead of crashing", async () => {
    state.script = [
      [
        {
          delta: null,
          toolCalls: [{
            index: 0,
            id: "call_x",
            name: "write_file",
            argumentsDelta: JSON.stringify({ path: "../escaped.txt", content: "no" }),
          }],
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
      ],
      textRound,
    ];

    const res = await chat("escape the sandbox");
    const text = await res.text();

    expect(text).toContain('"ok":false');
    await expect(readFile(path.resolve(sandbox, "../escaped.txt"))).rejects.toThrow();
    expect(capturedRequests).toHaveLength(2); // loop continued after the failure
  });

  it("asks for a final summary after the tool round budget", async () => {
    const toolRound: ChatChunk[] = [
      {
        delta: null,
        toolCalls: [{ index: 0, id: "call_y", name: "list_files", argumentsDelta: "{}" }],
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
    state.script = [toolRound, toolRound, toolRound, textRound];

    const res = await chat("loop forever");
    const text = await res.text();

    expect(text).toContain("Tool budget reached (3 tool rounds)");
    expect(text).toContain('"delta":"Done."');
    expect(text).toContain('"done":true');
    expect(capturedRequests).toHaveLength(4); // 3 tool rounds + final summary
    expect(capturedRequests[3]!.tools).toBeUndefined();
    expect(capturedRequests[3]!.messages[0]?.content).toContain("Tool budget reached");
    expect(
      capturedRequests[3]!.messages.some((message) => message.role === "tool"),
    ).toBe(true);
  });
});

describe("parallel tool calls", () => {
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

  it("executes independent reads from one message and logs them in call order", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await writeFile(path.join(sandbox, "read-a.txt"), "alpha", "utf8");
    await writeFile(path.join(sandbox, "read-b.txt"), "beta", "utf8");
    state.script = [
      multiToolRound([
        { id: "read_a", name: "read_file", args: { path: "read-a.txt" } },
        { id: "read_b", name: "read_file", args: { path: "read-b.txt" } },
      ]),
      textRound,
    ];

    const text = await (await chat("read both files")).text();
    expect(text).toContain('"id":"read_a"');
    expect(text).toContain('"id":"read_b"');
    expect(text).toContain('"name":"read_file"');
    expect(text).toContain('"done":true');
    expect(text).not.toContain(KEY);

    expect(capturedRequests).toHaveLength(2);
    const toolMessages = capturedRequests[1]!.messages.filter((message) => message.role === "tool");
    expect(toolMessages.map((message) => message.toolCallId)).toEqual(["read_a", "read_b"]);
    expect(toolMessages[0]?.content).toBe("alpha");
    expect(toolMessages[1]?.content).toBe("beta");
  });

  it("runs a write before a read in the same message", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    await rm(path.join(sandbox, "order.txt"), { force: true });
    state.script = [
      multiToolRound([
        { id: "write_order", name: "write_file", args: { path: "order.txt", content: "written first" } },
        { id: "read_order", name: "read_file", args: { path: "order.txt" } },
      ]),
      textRound,
    ];

    const text = await (await chat("write then read")).text();
    expect(text).toContain('"ok":true');
    expect(text).not.toContain(KEY);

    expect(capturedRequests).toHaveLength(2);
    const toolMessages = capturedRequests[1]!.messages.filter((message) => message.role === "tool");
    expect(toolMessages.map((message) => message.toolCallId)).toEqual(["write_order", "read_order"]);
    expect(toolMessages[1]?.content).toBe("written first");
  });
});

describe("build plan", () => {
  function planRound(
    id: string,
    steps: Array<{ title: string; status: string }>,
  ): ChatChunk[] {
    return [
      {
        delta: null,
        toolCalls: [{
          index: 0,
          id,
          name: "update_plan",
          argumentsDelta: JSON.stringify({ steps }),
        }],
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
  }

  it("publishes the plan over SSE and derives it from the log", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    const steps = [
      { title: "Scaffold the app", status: "completed" },
      { title: "Add authentication", status: "in_progress" },
      { title: "Run the design audit", status: "pending" },
    ];
    state.script = [planRound("call_plan", steps), textRound];

    const text = await (await chat("plan the build")).text();
    expect(text).toContain('"plan":{"steps":[');
    expect(text).toContain('"title":"Add authentication"');
    expect(text).toContain('"status":"in_progress"');
    expect(text).not.toContain(KEY);

    // The model saw its own plan call and the accepted result in round 2.
    expect(capturedRequests).toHaveLength(2);
    const second = capturedRequests[1]!;
    const planCall = second.messages.find(
      (message) => message.role === "assistant" && message.toolCalls?.some((call) => call.name === "update_plan"),
    );
    expect(planCall).toBeDefined();
    const planResult = second.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "call_plan",
    );
    expect(planResult?.content).toContain("Plan updated: 3 steps");

    const history = await (await fetch(`${base}/api/history`)).json() as {
      plan: { steps: Array<{ title: string; status: string }> } | null;
    };
    expect(history.plan).toEqual({ steps });
  });

  it("does not publish a plan that the tool rejected", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    state.script = [
      planRound("bad_plan", [{ title: "Broken", status: "done" }]),
      textRound,
    ];

    const text = await (await chat("bad plan")).text();
    expect(text).toContain('"ok":false');
    expect(text).not.toContain('"plan":');

    const history = await (await fetch(`${base}/api/history`)).json() as { plan: unknown };
    expect(history.plan).toBeNull();
  });
});


describe("model fallback", () => {
  const agentsOnly = "Provider responded 403: unsupported/model:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps";

  it("completes the message with the fallback router when the chosen model rejects app traffic", async () => {
    state.script = [
      { throw: agentsOnly },
      textRound,
    ];

    const res = await chat("build it", "unsupported/model:free");
    const text = await res.text();

    expect(text).toContain('"note":"unsupported/model:free rejects app traffic');
    expect(text).toContain("openrouter/free");
    expect(text).toContain('"delta":"Done."');
    expect(text).toContain('"done":true');

    // Attempt 1 was the refused model; attempt 2 was the fallback router.
    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[0]!.model).toBe("unsupported/model:free");
    expect(capturedRequests[1]!.model).toBe("openrouter/free");
  });

  it("does not double-fallback when the fallback model itself is refused", async () => {
    state.script = [
      { throw: "Provider responded 403: openrouter/free is only available on agentic harnesses. x" },
    ];

    const res = await chat("build it", "openrouter/free");
    const text = await res.text();

    expect(text).toContain("agentic harnesses");
    expect(text).not.toContain('"note"');
    expect(capturedRequests).toHaveLength(1); // no retry on the same model
  });
});

describe("conversation state", () => {
  it("keeps history across turns and wipes it on reset", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" }); // tests above share the server conversation
    state.script = [textRound];
    await (await chat("first message")).text(); // drain: server finishes the turn
    expect(capturedRequests[0]!.messages).toHaveLength(3); // system + runtime context + user
    expect(capturedRequests[0]!.messages.some(
      (message) => message.role === "system" && message.content.startsWith("<runtime-context>"),
    )).toBe(true);

    state.script = [textRound];
    await (await chat("second message")).text();
    expect(capturedRequests[1]!.messages).toHaveLength(5); // + assistant + user; context deduped

    const reset = await fetch(`${base}/api/reset`, { method: "POST" });
    expect(reset.status).toBe(200);

    state.script = [textRound];
    await (await chat("third message")).text();
    expect(capturedRequests[2]!.messages).toHaveLength(3); // fresh context + user
  });

  it("restores the conversation from the sandbox log after a restart", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    state.script = [textRound];
    await (await chat("durable hello")).text();

    // A fresh server over the same sandbox derives the same conversation:
    // the log, not process memory, is the source of truth.
    const second = createWebStudioServer({
      ...deps,
      createRunner: () => fakeRunner, // do not steal the primary server's runner handlers
    });
    await new Promise<void>((resolve) => second.listen(0, "127.0.0.1", resolve));
    const secondPort = (second.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${secondPort}/api/history`);
      expect(res.status).toBe(200);
      const body = await res.json() as { messages: Array<{ role: string; content: string }> };
      const visible = body.messages.filter((message) => message.role !== "system");
      expect(visible.map((message) => message.role)).toEqual(["user", "assistant"]);
      expect(visible[0]?.content).toBe("durable hello");
      expect(visible[1]?.content).toBe("Done.");
      expect(body.messages.some(
        (message) => message.role === "system" && message.content.startsWith("<runtime-context>"),
      )).toBe(true);
    } finally {
      second.closeAllConnections();
      second.close();
    }
  });

  it("rejects invalid bodies with 400", async () => {
    const res = await chat("");
    expect(res.status).toBe(400);
  });
});

describe("context compaction", () => {
  it("compacts the request view while the durable log keeps the full result", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "a8-compact-test-"));
    try {
      const seed = new SessionLog(path.join(dir, ".authenik8", "session.jsonl"));
      await seed.append({ role: "user", content: "earlier build" });
      await seed.append({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "old_call", name: "read_file", arguments: "{}" }],
      });
      await seed.append({ role: "tool", toolCallId: "old_call", content: "x".repeat(6_000) });
      await seed.append({ role: "assistant", content: "that file is large" });
      await seed.append({ role: "user", content: "now add auth" });
      await seed.append({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "new_call", name: "list_files", arguments: "{}" }],
      });
      await seed.append({ role: "tool", toolCallId: "new_call", content: "src/\npackage.json" });
      await seed.append({ role: "assistant", content: "ready" });

      const compactServer = createWebStudioServer({
        ...deps,
        sandboxRoot: dir,
        contextBudgetChars: 2_000,
        createRunner: () => fakeRunner,
      });
      await new Promise<void>((resolve) => compactServer.listen(0, "127.0.0.1", resolve));
      const compactPort = (compactServer.address() as AddressInfo).port;
      try {
        capturedRequests.length = 0;
        state.roundIndex = 0;
        state.script = [textRound];
        const res = await fetch(`http://127.0.0.1:${compactPort}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-openrouter-key": KEY },
          body: JSON.stringify({ message: "continue", model: "free/model-a" }),
        });
        const text = await res.text();
        expect(text).toContain('"compaction"');

        const sent = capturedRequests[0]!.messages;
        const compacted = sent.find(
          (message) => message.role === "tool" && message.toolCallId === "old_call",
        );
        expect(compacted?.content).toContain("[compacted tool result] read_file");
        expect(compacted?.content).not.toContain("x".repeat(1_000));

        const historyRes = await fetch(`http://127.0.0.1:${compactPort}/api/history`);
        const history = await historyRes.json() as {
          messages: Array<{ role: string; toolCallId?: string; content: string }>;
        };
        const full = history.messages.find(
          (message) => message.role === "tool" && message.toolCallId === "old_call",
        );
        expect(full?.content).toHaveLength(6_000);
      } finally {
        compactServer.closeAllConnections();
        compactServer.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

