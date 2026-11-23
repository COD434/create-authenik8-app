import type { ToolOutcome } from "./tools.js";

/**
 * Tool scheduling for the parent loop.
 *
 * Read-only calls can overlap because they never change the sandbox. Every
 * other tool is an exclusive barrier: write_file, update_plan, explore_project,
 * review_project, build_project, and unknown tools run alone and in call order.
 * A read that follows a write therefore observes the write, and plan events stay
 * deterministic.
 *
 * Results always come back in call order, even when reads complete out of
 * order, so the session log and the model request stay stable.
 */

const READ_ONLY_TOOLS = new Set(["list_files", "read_file", "design_audit", "canon_audit"]);

/** Bound peak file reads when a model batches many read-only calls at once. */
export const MAX_PARALLEL_READS = 4;

export type ToolBatch<T extends { name: string }> = {
  calls: T[];
  concurrent: boolean;
};

export function planToolBatches<T extends { name: string }>(calls: T[]): Array<ToolBatch<T>> {
  const batches: Array<ToolBatch<T>> = [];
  for (const call of calls) {
    const concurrent = READ_ONLY_TOOLS.has(call.name);
    const last = batches.at(-1);
    if (concurrent && last !== undefined && last.concurrent) {
      last.calls.push(call);
    } else {
      batches.push({ calls: [call], concurrent });
    }
  }
  return batches;
}

export async function executeToolBatch<T extends { name: string }>(
  batch: ToolBatch<T>,
  execute: (call: T) => Promise<ToolOutcome>,
): Promise<ToolOutcome[]> {
  if (!batch.concurrent) {
    const call = batch.calls[0];
    return call === undefined ? [] : [await execute(call)];
  }

  const outcomes: ToolOutcome[] = new Array(batch.calls.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(MAX_PARALLEL_READS, batch.calls.length) },
    async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= batch.calls.length) return;
        const call = batch.calls[index];
        if (call === undefined) return;
        outcomes[index] = await execute(call);
      }
    },
  );
  await Promise.all(workers);
  return outcomes;
}
