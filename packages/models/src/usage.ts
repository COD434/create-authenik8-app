import type { ChatUsage, UsageTotals } from "./types.js";

/**
 * Session-scoped usage accounting. Records token counts and cost estimates
 * reported by providers; cost is summed only over requests with known
 * pricing, and `costUsd` stays null until the first known-priced request.
 */
export class UsageTracker {
  private requestsCount = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;
  private costAccumulator = 0;
  private costKnown = false;

  recordRequest(): void {
    this.requestsCount += 1;
  }

  record(usage: ChatUsage): void {
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.totalTokens += usage.totalTokens;
    if (usage.costUsd !== null) {
      this.costKnown = true;
      this.costAccumulator += usage.costUsd;
    }
  }

  totals(): UsageTotals {
    return {
      requests: this.requestsCount,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      costUsd: this.costKnown ? this.costAccumulator : null,
    };
  }
}
