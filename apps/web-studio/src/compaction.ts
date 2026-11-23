import type { ChatMessage } from "@authenik8/models";

/**
 * Request-view compaction, adapted from the DeepSeek Harness tool-result
 * pruner:
 *
 * - the durable session log is never rewritten; only the messages sent to the
 *   model are compacted, so the full history stays inspectable;
 * - the newest tool round and the last few messages are protected: the model
 *   is actively working from them;
 * - older, large tool results are replaced with a one-line summary that keeps
 *   the tool name, the original size, and the first line of output;
 * - summaries carry a marker and are skipped on later passes, so compaction is
 *   idempotent.
 *
 * The budget is measured in characters (a rough 4 chars per token) and counts
 * assistant tool-call arguments as well as message content. Only tool results
 * are pruned in this slice; tool-call arguments and user text stay intact.
 */

export const DEFAULT_CONTEXT_BUDGET_CHARS = 32_000;
const MIN_PRUNE_CHARS = 600;
const PROTECTED_TAIL_MESSAGES = 8;
const SUMMARY_MARKER = "[compacted tool result]";

export type CompactionResult = {
  /** Messages to send to the provider. The input array is not mutated. */
  messages: ChatMessage[];
  /** Number of tool results replaced with a summary. */
  pruned: number;
  /** Characters removed from the request view. */
  savedChars: number;
};

function messageChars(message: ChatMessage): number {
  let chars = message.content.length;
  for (const call of message.toolCalls ?? []) chars += call.arguments.length;
  return chars;
}

function summarizeToolResult(name: string, content: string): string {
  const firstLine = (content.split("\n")[0] ?? "").trim();
  const preview = firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
  return `${SUMMARY_MARKER} ${name}: ${content.length} chars elided. First line: ${preview === "" ? "(empty)" : preview}`;
}

export function compactForRequest(
  messages: readonly ChatMessage[],
  budgetChars: number = DEFAULT_CONTEXT_BUDGET_CHARS,
): CompactionResult {
  let remaining = 0;
  for (const message of messages) remaining += messageChars(message);
  if (remaining <= budgetChars) return { messages: [...messages], pruned: 0, savedChars: 0 };

  const toolNames = new Map<string, string>();
  let lastToolRoundStart = 0;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message === undefined) continue;
    if (message.role === "assistant" && message.toolCalls !== undefined && message.toolCalls.length > 0) {
      lastToolRoundStart = index;
      for (const call of message.toolCalls) toolNames.set(call.id, call.name);
    }
  }

  const protectedFrom = Math.max(lastToolRoundStart, messages.length - PROTECTED_TAIL_MESSAGES);
  const next = [...messages];
  let pruned = 0;
  let savedChars = 0;

  // Oldest first: the newest results are the ones the model is using now.
  for (let index = 0; index < protectedFrom && remaining > budgetChars; index++) {
    const message = next[index];
    if (message === undefined || message.role !== "tool") continue;
    if (message.content.length < MIN_PRUNE_CHARS) continue;
    if (message.content.startsWith(SUMMARY_MARKER)) continue;

    const name = (message.toolCallId !== undefined ? toolNames.get(message.toolCallId) : undefined) ?? "tool";
    const summary = summarizeToolResult(name, message.content);
    const saved = message.content.length - summary.length;
    if (saved <= 0) continue;

    next[index] = { ...message, content: summary };
    remaining -= saved;
    savedChars += saved;
    pruned++;
  }

  return { messages: next, pruned, savedChars };
}
