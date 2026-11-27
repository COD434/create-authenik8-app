import { describe, expect, it } from "vitest";

import {
  createLegacyAgentAdapterState,
  createLegacyChatAdapterState,
  createLegacyRunAdapterState,
  createStudioEventStream,
  fromLegacyAgentSseEvent,
  fromLegacyChatSseEvent,
  fromLegacyRunSseEvent,
  isStudioEvent,
  STUDIO_EVENT_VERSION,
} from "../src/execution-events.js";

describe("execution-events", () => {
  it("emits normalized studio events with version, ids, seq, and timestamp", () => {
    const stream = createStudioEventStream({
      startSeq: 10,
      now: () => "2026-01-01T00:00:00.000Z",
      id: () => "se_test",
    });

    const event = stream.emit({
      sessionId: "ses_1",
      turnId: "turn_1",
      source: "chat",
      kind: "turn.started",
      activityId: "turn_1",
      state: "running",
      payload: { mode: "build" },
    });

    expect(event).toEqual({
      v: STUDIO_EVENT_VERSION,
      id: "se_test",
      seq: 11,
      ts: "2026-01-01T00:00:00.000Z",
      sessionId: "ses_1",
      turnId: "turn_1",
      source: "chat",
      kind: "turn.started",
      activityId: "turn_1",
      state: "running",
      payload: { mode: "build" },
    });
    expect(isStudioEvent(event)).toBe(true);
  });

  it("maps legacy chat SSE events into stable activity timeline events", () => {
    const stream = createStudioEventStream({
      now: () => "2026-01-01T00:00:00.000Z",
      id: (() => {
        let n = 0;
        return () => `se_${++n}`;
      })(),
    });
    const state = createLegacyChatAdapterState("ses_1", "turn_1");

    const events = [
      ...fromLegacyChatSseEvent({ round: 1, mode: "build" }, state, stream),
      ...fromLegacyChatSseEvent({ delta: "Hello" }, state, stream),
      ...fromLegacyChatSseEvent({ tool: { id: "tool_1", name: "read_file", phase: "start" } }, state, stream),
      ...fromLegacyChatSseEvent({ tool: { id: "tool_1", name: "read_file", phase: "done", ok: true, summary: "ok" } }, state, stream),
      ...fromLegacyChatSseEvent({ plan: { steps: [{ title: "Step", status: "pending" }] } }, state, stream),
      ...fromLegacyChatSseEvent({ compaction: { pruned: 2, savedChars: 120 } }, state, stream),
      ...fromLegacyChatSseEvent({ done: true, rounds: 1 }, state, stream),
    ];

    expect(events.map((e) => e.kind)).toEqual([
      "assistant.message.started",
      "assistant.message.delta",
      "tool.started",
      "tool.completed",
      "plan.updated",
      "notice",
      "assistant.message.completed",
      "turn.completed",
    ]);

    expect(events[0]).toMatchObject({ activityId: "turn_1:assistant:1", state: "running" });
    expect(events[2]).toMatchObject({ activityId: "tool_1", kind: "tool.started", state: "running" });
    expect(events[3]).toMatchObject({ activityId: "tool_1", kind: "tool.completed", state: "completed" });
    expect(events[4]).toMatchObject({ activityId: "turn_1:plan", payload: { plan: { steps: [{ title: "Step", status: "pending" }] } } });
    expect(events[5]).toMatchObject({ source: "system", kind: "notice", payload: { type: "compaction", pruned: 2, savedChars: 120 } });
    expect(events[6]).toMatchObject({ activityId: "turn_1:assistant:1", kind: "assistant.message.completed" });
    expect(events[7]).toMatchObject({ activityId: "turn_1", kind: "turn.completed" });
    expect(events.every(isStudioEvent)).toBe(true);
  });

  it("maps reasoning lifecycle and closes reasoning before assistant delta", () => {
    const stream = createStudioEventStream({
      now: () => "2026-01-01T00:00:00.000Z",
      id: (() => {
        let n = 0;
        return () => `se_${++n}`;
      })(),
    });
    const state = createLegacyChatAdapterState("ses_1", "turn_1");

    const events = [
      ...fromLegacyChatSseEvent({ round: 1 }, state, stream),
      ...fromLegacyChatSseEvent({ reasoning: "thinking" }, state, stream),
      ...fromLegacyChatSseEvent({ delta: "answer" }, state, stream),
      ...fromLegacyChatSseEvent({ done: true, rounds: 1 }, state, stream),
    ];

    expect(events.map((e) => e.kind)).toEqual([
      "assistant.message.started",
      "reasoning.started",
      "reasoning.delta",
      "reasoning.completed",
      "assistant.message.delta",
      "assistant.message.completed",
      "turn.completed",
    ]);
    expect(events[1].activityId).toBe("turn_1:reasoning:1");
    expect(events[2].activityId).toBe("turn_1:reasoning:1");
    expect(events[3].activityId).toBe("turn_1:reasoning:1");
  });

  it("maps tool failure and chat error events", () => {
    const stream = createStudioEventStream({
      now: () => "2026-01-01T00:00:00.000Z",
      id: (() => {
        let n = 0;
        return () => `se_${++n}`;
      })(),
    });
    const state = createLegacyChatAdapterState("ses_1", "turn_1");

    const events = [
      ...fromLegacyChatSseEvent({ tool: { id: "tool_1", name: "write_file", phase: "done", ok: false, summary: "denied" } }, state, stream),
      ...fromLegacyChatSseEvent({ error: "boom" }, state, stream),
    ];

    expect(events[0]).toMatchObject({
      kind: "tool.failed",
      activityId: "tool_1",
      state: "failed",
      payload: { name: "write_file", ok: false, summary: "denied" },
    });
    expect(events[1]).toMatchObject({
      kind: "error",
      source: "chat",
      activityId: "turn_1:error",
      state: "failed",
      payload: { message: "boom" },
    });
  });

  it("maps agent lifecycle and preserves raw untrusted agent events", () => {
    const stream = createStudioEventStream({ now: () => "2026-01-01T00:00:00.000Z", id: (() => { let n = 0; return () => `se_${++n}`; })() });
    const state = createLegacyAgentAdapterState("ses_1", "turn_agent");
    const events = [
      ...fromLegacyAgentSseEvent({ agent: { phase: "start" } }, state, stream),
      ...fromLegacyAgentSseEvent({ agentEvent: { type: "command", message: "npm test" } }, state, stream),
      ...fromLegacyAgentSseEvent({ agent: { phase: "done", ok: false, errorCode: "spawn_failed", errorMessage: "failed" } }, state, stream),
    ];
    expect(events.map((e) => e.kind)).toEqual(["turn.started", "command.output", "turn.failed", "error"]);
    expect(events[1].payload.untrusted).toBe(true);
    expect(events[1].payload.raw).toEqual({ type: "command", message: "npm test" });
  });

  it("maps runner output and completion", () => {
    const stream = createStudioEventStream({ now: () => "2026-01-01T00:00:00.000Z", id: (() => { let n = 0; return () => `se_${++n}`; })() });
    const state = createLegacyRunAdapterState("ses_1", "turn_run");
    const events = [
      ...fromLegacyRunSseEvent({ run: { phase: "starting" } }, state, stream),
      ...fromLegacyRunSseEvent({ runOut: "hello" }, state, stream),
      ...fromLegacyRunSseEvent({ run: { phase: "exited", ok: true } }, state, stream),
    ];
    expect(events.map((e) => e.kind)).toEqual(["command.started", "command.output", "command.completed"]);
    expect(events[1]).toMatchObject({ activityId: "turn_run:command", payload: { text: "hello" } });
  });

  it("emits file.changed when write_file completes", () => {
    const stream = createStudioEventStream({ now: () => "2026-01-01T00:00:00.000Z", id: (() => { let n = 0; return () => `se_${++n}`; })() });
    const state = createLegacyChatAdapterState("ses_1", "turn_1");
    const events = [
      ...fromLegacyChatSseEvent({ tool: { id: "tool_1", name: "write_file", phase: "start", arguments: JSON.stringify({ path: "src/a.ts", content: "x" }) } }, state, stream),
      ...fromLegacyChatSseEvent({ tool: { id: "tool_1", name: "write_file", phase: "done", ok: true, summary: "wrote src/a.ts" } }, state, stream),
    ];
    expect(events.map((e) => e.kind)).toEqual(["tool.started", "tool.completed", "file.changed"]);
    expect(events[2]).toMatchObject({ kind: "file.changed", payload: { path: "src/a.ts", toolId: "tool_1" } });
  });
});
