import { describe, expect, it } from "vitest";

import { assembleToolCalls } from "../src/tools.js";
import type { ToolCallDelta } from "../src/types.js";

function fragment(overrides: Partial<ToolCallDelta> & { index: number }): ToolCallDelta {
  return { id: null, name: null, argumentsDelta: "", ...overrides };
}

describe("assembleToolCalls", () => {
  it("concatenates argument fragments and preserves provider order by index", () => {
    const calls = assembleToolCalls([
      fragment({ index: 1, id: "call_b", name: "second", argumentsDelta: "B1" }),
      fragment({ index: 0, id: "call_a", name: "first", argumentsDelta: "{\"x\": " }),
      fragment({ index: 0, argumentsDelta: "1}" }),
      fragment({ index: 1, argumentsDelta: "B2" }),
    ]);
    expect(calls).toEqual([
      { id: "call_a", name: "first", arguments: '{"x": 1}' },
      { id: "call_b", name: "second", arguments: "B1B2" },
    ]);
  });

  it("keeps the id and name from the first fragment that provides them", () => {
    const calls = assembleToolCalls([
      fragment({ index: 0, id: "call_a", name: "tool_a", argumentsDelta: "{}" }),
      fragment({ index: 0, id: "call_a_again", name: "tool_a_again", argumentsDelta: "{}" }),
    ]);
    expect(calls).toEqual([{ id: "call_a", name: "tool_a", arguments: "{}{}" }]);
  });

  it("drops calls that never received an id or name", () => {
    const calls = assembleToolCalls([
      fragment({ index: 0, name: "orphan", argumentsDelta: "{}" }),
      fragment({ index: 1, id: "call_b", argumentsDelta: "{}" }),
      fragment({ index: 2, id: "call_c", name: "complete", argumentsDelta: "{}" }),
    ]);
    expect(calls).toEqual([{ id: "call_c", name: "complete", arguments: "{}" }]);
  });

  it("returns an empty array for no fragments", () => {
    expect(assembleToolCalls([])).toEqual([]);
  });
});
