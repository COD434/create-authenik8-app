import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@authenik8/models";

import { parsePlanArgs, planFromMessages, summarizePlan, type Plan } from "../src/plan.js";

const plan: Plan = {
  steps: [
    { title: "Scaffold the app", status: "completed" },
    { title: "Add authentication", status: "in_progress" },
    { title: "Run the design audit", status: "pending" },
  ],
};

function planCall(id: string, value: unknown): ChatMessage {
  return {
    role: "assistant",
    content: "",
    toolCalls: [{ id, name: "update_plan", arguments: JSON.stringify(value) }],
  };
}

describe("parsePlanArgs", () => {
  it("parses and trims a valid plan", () => {
    expect(parsePlanArgs(JSON.stringify({
      steps: [{ title: "  Scaffold  ", status: "completed" }],
    }))).toEqual({ steps: [{ title: "Scaffold", status: "completed" }] });
  });

  it("rejects malformed plans and out-of-range values", () => {
    expect(parsePlanArgs("{}")).toBeNull();
    expect(parsePlanArgs("{not json")).toBeNull();
    expect(parsePlanArgs(JSON.stringify({ steps: [] }))).toBeNull();
    expect(parsePlanArgs(JSON.stringify({ steps: [{ title: "   ", status: "pending" }] }))).toBeNull();
    expect(parsePlanArgs(JSON.stringify({ steps: [{ title: "x", status: "done" }] }))).toBeNull();
    expect(parsePlanArgs(JSON.stringify({ steps: [{ title: "x".repeat(121), status: "pending" }] }))).toBeNull();
    expect(parsePlanArgs(JSON.stringify({
      steps: Array.from({ length: 9 }, (_, index) => ({ title: `Step ${index}`, status: "pending" })),
    }))).toBeNull();
  });
});

describe("summarizePlan", () => {
  it("counts each status in the model-facing result", () => {
    expect(summarizePlan(plan)).toBe("Plan updated: 3 steps (1 completed, 1 in progress, 1 pending).");
  });

  it("uses the singular for one step", () => {
    expect(summarizePlan({ steps: [{ title: "Only", status: "pending" }] }))
      .toBe("Plan updated: 1 step (0 completed, 0 in progress, 1 pending).");
  });
});

describe("planFromMessages", () => {
  it("returns the latest successfully applied plan", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "build it" },
      planCall("first", plan),
      { role: "tool", toolCallId: "first", content: "Plan updated: 3 steps." },
      planCall("second", { steps: [{ title: "Ship", status: "in_progress" }] }),
      { role: "tool", toolCallId: "second", content: "Plan updated: 1 step." },
    ];
    expect(planFromMessages(messages)).toEqual({ steps: [{ title: "Ship", status: "in_progress" }] });
  });

  it("ignores rejected and interrupted calls, keeping the previous plan", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "build it" },
      planCall("ok", plan),
      { role: "tool", toolCallId: "ok", content: "Plan updated: 3 steps." },
      planCall("rejected", { steps: [{ title: "Broken", status: "done" }] }),
      { role: "tool", toolCallId: "rejected", content: "Error: invalid tool arguments" },
      planCall("interrupted", { steps: [{ title: "Lost", status: "pending" }] }),
    ];
    expect(planFromMessages(messages)).toEqual(plan);
  });

  it("ignores a plan call with no recorded result", () => {
    expect(planFromMessages([planCall("pending", plan)])).toBeNull();
  });

  it("returns null when the log has no plan", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    expect(planFromMessages(messages)).toBeNull();
  });
});
