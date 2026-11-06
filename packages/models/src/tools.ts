import type { ToolCall, ToolCallDelta } from "./types.js";

/**
 * Assemble streamed tool-call fragments into complete calls.
 *
 * Fragments arrive with a provider-assigned `index` (the call's position in
 * the response); `id` and `name` appear on the first fragment of each call
 * and arguments stream across fragments as JSON text pieces. Calls that
 * never received an id or name are dropped: the assembler never invents
 * identifiers for a request it cannot answer.
 */
export function assembleToolCalls(fragments: readonly ToolCallDelta[]): ToolCall[] {
  const slots = new Map<number, { id: string | null; name: string | null; arguments: string }>();
  for (const fragment of fragments) {
    const slot = slots.get(fragment.index) ?? { id: null, name: null, arguments: "" };
    if (slot.id === null && fragment.id !== null) slot.id = fragment.id;
    if (slot.name === null && fragment.name !== null) slot.name = fragment.name;
    slot.arguments += fragment.argumentsDelta;
    slots.set(fragment.index, slot);
  }
  const calls: ToolCall[] = [];
  for (const index of [...slots.keys()].sort((a, b) => a - b)) {
    const slot = slots.get(index)!;
    if (slot.id === null || slot.name === null) continue;
    calls.push({ id: slot.id, name: slot.name, arguments: slot.arguments });
  }
  return calls;
}
