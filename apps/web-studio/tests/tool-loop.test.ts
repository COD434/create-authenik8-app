import { describe, expect, it } from "vitest";

import { executeToolBatch, MAX_PARALLEL_READS, planToolBatches } from "../src/tool-loop.js";

type TestCall = { id: string; name: string };

describe("tool batches", () => {
  it("groups adjacent read-only calls and isolates every barrier", () => {
    const calls: TestCall[] = [
      { id: "a", name: "read_file" },
      { id: "b", name: "list_files" },
      { id: "c", name: "write_file" },
      { id: "d", name: "design_audit" },
      { id: "e", name: "read_file" },
      { id: "f", name: "update_plan" },
      { id: "g", name: "explore_project" },
      { id: "g2", name: "review_project" },
      { id: "g3", name: "build_project" },
      { id: "h", name: "read_file" },
      { id: "i", name: "not_a_tool" },
      { id: "j", name: "read_file" },
    ];

    expect(planToolBatches(calls).map((batch) => ({
      names: batch.calls.map((call) => call.name),
      concurrent: batch.concurrent,
    }))).toEqual([
      { names: ["read_file", "list_files"], concurrent: true },
      { names: ["write_file"], concurrent: false },
      { names: ["design_audit", "read_file"], concurrent: true },
      { names: ["update_plan"], concurrent: false },
      { names: ["explore_project"], concurrent: false },
      { names: ["review_project"], concurrent: false },
      { names: ["build_project"], concurrent: false },
      { names: ["read_file"], concurrent: true },
      { names: ["not_a_tool"], concurrent: false },
      { names: ["read_file"], concurrent: true },
    ]);
    expect(planToolBatches([])).toEqual([]);
  });

  it("runs a read-only batch concurrently and returns results in call order", async () => {
    const batch = planToolBatches<TestCall>([
      { id: "a", name: "read_file" },
      { id: "b", name: "read_file" },
    ])[0]!;
    let active = 0;
    let maxActive = 0;

    const outcomes = await executeToolBatch(batch, async (call) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return { ok: true, result: call.id };
    });

    expect(maxActive).toBe(2);
    expect(outcomes.map((outcome) => outcome.result)).toEqual(["a", "b"]);
  });

  it("bounds a large read-only batch", async () => {
    const calls: TestCall[] = Array.from(
      { length: 6 },
      (_, index) => ({ id: `r${index}`, name: "read_file" }),
    );
    const batch = planToolBatches(calls)[0]!;
    let active = 0;
    let maxActive = 0;

    const outcomes = await executeToolBatch(batch, async (call) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return { ok: true, result: call.id };
    });

    expect(maxActive).toBe(MAX_PARALLEL_READS);
    expect(outcomes.map((outcome) => outcome.result)).toEqual(calls.map((call) => call.id));
  });

  it("runs a barrier batch alone", async () => {
    const batch = planToolBatches<TestCall>([{ id: "w", name: "write_file" }])[0]!;
    let active = 0;
    let maxActive = 0;

    const outcomes = await executeToolBatch(batch, async (call) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return { ok: true, result: call.id };
    });

    expect(maxActive).toBe(1);
    expect(outcomes).toEqual([{ ok: true, result: "w" }]);
  });
});
