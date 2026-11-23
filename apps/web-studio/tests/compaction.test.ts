import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@authenik8/models";

import { compactForRequest } from "../src/compaction.js";

const big = (chars: number): string => "x".repeat(chars);

/** A long history with one old big result and a newer tool round. */
function historyWithOldResult(resultChars: number): ChatMessage[] {
  return [
    { role: "user", content: "build" },
    { role: "assistant", content: "", toolCalls: [{ id: "old", name: "read_file", arguments: "{}" }] },
    { role: "tool", toolCallId: "old", content: big(resultChars) },
    { role: "assistant", content: "that file is large" },
    { role: "user", content: "keep going" },
    { role: "assistant", content: "working" },
    { role: "user", content: "more" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "final" },
    { role: "assistant", content: "", toolCalls: [{ id: "new", name: "list_files", arguments: "{}" }] },
    { role: "tool", toolCallId: "new", content: big(4_000) },
  ];
}

describe("compactForRequest", () => {
  it("leaves a conversation under budget untouched", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = compactForRequest(messages, 10_000);
    expect(result.pruned).toBe(0);
    expect(result.savedChars).toBe(0);
    expect(result.messages).toEqual(messages);
    expect(result.messages).not.toBe(messages);
  });

  it("prunes the oldest large tool result and protects the latest round", () => {
    const result = compactForRequest(historyWithOldResult(5_000), 2_000);

    expect(result.pruned).toBe(1);
    expect(result.messages[2]?.content).toContain("[compacted tool result] read_file");
    expect(result.messages[2]?.toolCallId).toBe("old");
    expect(result.messages[10]?.content).toBe(big(4_000)); // newest round intact
    expect(result.savedChars).toBeGreaterThan(4_000);
  });

  it("is idempotent on an already compacted view", () => {
    const first = compactForRequest(historyWithOldResult(5_000), 2_000);
    const second = compactForRequest(first.messages, 2_000);
    expect(second.pruned).toBe(0);
    expect(second.messages).toEqual(first.messages);
  });

  it("skips small tool results", () => {
    const result = compactForRequest(historyWithOldResult(100), 1_000);
    expect(result.pruned).toBe(0);
  });

  it("never prunes user or assistant text", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: big(3_000) },
      { role: "assistant", content: big(3_000) },
      { role: "user", content: big(3_000) },
      { role: "assistant", content: big(3_000) },
    ];
    const result = compactForRequest(messages, 100);
    expect(result.pruned).toBe(0);
    expect(result.messages.every((message) => message.content.length === 3_000)).toBe(true);
  });
});
