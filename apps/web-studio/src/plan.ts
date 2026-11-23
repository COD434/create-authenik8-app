import { z } from "zod";

import type { ChatMessage } from "@authenik8/models";

/**
 * Build plan, adapted from the DeepSeek Harness todo/plan tool.
 *
 * The plan is not separate UI state: it is carried by the assistant's
 * `update_plan` tool call in the durable log. A matching, non-error tool
 * result proves the call was accepted. `/api/history` and the live SSE stream
 * derive the latest plan from that log, so a refresh, restart, or request-view
 * compaction cannot lose it.
 */

export const PLAN_MAX_STEPS = 8;
export const PLAN_MAX_TITLE_CHARS = 120;

export const planStepSchema = z.object({
  title: z.string().trim().min(1).max(PLAN_MAX_TITLE_CHARS),
  status: z.enum(["pending", "in_progress", "completed"]),
});

export const planArgsSchema = z.object({
  steps: z.array(planStepSchema).min(1).max(PLAN_MAX_STEPS),
});

export type PlanStep = z.infer<typeof planStepSchema>;
export type Plan = { steps: PlanStep[] };

/** Parse model-supplied arguments; null means the plan is invalid. */
export function parsePlanArgs(argumentsJson: string): Plan | null {
  try {
    const parsed = planArgsSchema.parse(JSON.parse(argumentsJson));
    return { steps: parsed.steps };
  } catch {
    return null;
  }
}

/** Compact model-facing confirmation; the steps are in the tool call itself. */
export function summarizePlan(plan: Plan): string {
  const completed = plan.steps.filter((step) => step.status === "completed").length;
  const inProgress = plan.steps.filter((step) => step.status === "in_progress").length;
  const pending = plan.steps.length - completed - inProgress;
  const noun = plan.steps.length === 1 ? "step" : "steps";
  return `Plan updated: ${plan.steps.length} ${noun} (${completed} completed, ${inProgress} in progress, ${pending} pending).`;
}

/**
 * The latest successfully applied plan, derived from the durable log.
 * Failed or interrupted calls are skipped; the previous plan remains.
 */
export function planFromMessages(messages: ChatMessage[]): Plan | null {
  const results = new Map<string, string>();
  for (const message of messages) {
    if (message.role === "tool" && message.toolCallId !== undefined) {
      results.set(message.toolCallId, message.content);
    }
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message === undefined || message.role !== "assistant" || message.toolCalls === undefined) continue;
    for (let callIndex = message.toolCalls.length - 1; callIndex >= 0; callIndex--) {
      const call = message.toolCalls[callIndex];
      if (call === undefined || call.name !== "update_plan") continue;
      const result = results.get(call.id);
      if (result === undefined || result.startsWith("Error:")) continue;
      const plan = parsePlanArgs(call.arguments);
      if (plan !== null) return plan;
    }
  }
  return null;
}
