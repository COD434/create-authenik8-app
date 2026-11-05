import { ModelsError } from "./errors.js";
import { resolveRetryPolicy, withRetries, type RetryPolicy } from "./retry.js";
import { UsageTracker } from "./usage.js";
import type {
  ChatChunk,
  ChatRequest,
  ChatResult,
  ChatUsage,
  ModelInfo,
  ProviderAdapter,
  UsageTotals,
} from "./types.js";

/**
 * Session-scoped gateway over a provider adapter: budget enforcement,
 * usage accounting, and retry wiring.
 *
 * Budget semantics (honest limits):
 * - `maxRequests` counts top-level requests; retries of one request do not
 *   count separately.
 * - `maxSpendUsd` is enforced on accumulated spend AFTER each response; a
 *   single request may overshoot the cap by its own cost, bounded by its
 *   `maxTokens`. Cost is only known when the model's pricing was discovered;
 *   spend checks are skipped for unknown-priced models (request caps still
 *   apply).
 */
export type BudgetOptions = {
  maxSpendUsd?: number;
  maxRequests?: number;
};

export type ModelsGatewayOptions = {
  provider: ProviderAdapter;
  budget?: BudgetOptions;
  retry?: Partial<RetryPolicy>;
};

export type ModelsGateway = {
  providerId: string;
  /** Model discovery (the adapter caches its listing per session). */
  listModels(): Promise<ModelInfo[]>;
  chat(request: ChatRequest): Promise<ChatResult>;
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk>;
  usage(): UsageTotals;
};

export function createModelsGateway(options: ModelsGatewayOptions): ModelsGateway {
  const provider = options.provider;
  const maxSpendUsd = options.budget?.maxSpendUsd;
  const maxRequests = options.budget?.maxRequests;
  const policy = resolveRetryPolicy(options.retry);
  const tracker = new UsageTracker();

  function assertBudget(): void {
    if (maxRequests !== undefined && tracker.totals().requests >= maxRequests) {
      throw new ModelsError({
        code: "request_limit_exceeded",
        message: `Request limit reached (${maxRequests} per session)`,
      });
    }
    const { costUsd } = tracker.totals();
    if (maxSpendUsd !== undefined && costUsd !== null && costUsd >= maxSpendUsd) {
      throw new ModelsError({
        code: "budget_exhausted",
        message: `Estimated spend ${costUsd.toFixed(6)} USD reached the session budget cap`,
      });
    }
  }

  function classify(error: unknown): { retryable: boolean; retryAfterMs: number | null } {
    if (error instanceof ModelsError) {
      return { retryable: error.retryable, retryAfterMs: error.retryAfterMs };
    }
    return { retryable: false, retryAfterMs: null };
  }

  function recordSettled(usage: ChatUsage | null): void {
    if (usage !== null) tracker.record(usage);
    tracker.recordRequest();
  }

  return {
    providerId: provider.id,

    listModels(): Promise<ModelInfo[]> {
      return provider.listModels();
    },

    async chat(request: ChatRequest): Promise<ChatResult> {
      assertBudget();
      try {
        const result = await withRetries(
          policy,
          () => provider.chatCompletion(request),
          classify,
          request.signal,
        );
        recordSettled(result.usage);
        return result;
      } catch (error) {
        recordSettled(null);
        throw error;
      }
    },

    async *chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
      assertBudget();
      let established: AsyncIterable<ChatChunk>;
      try {
        established = await withRetries(
          policy,
          () => provider.openChatStream(request),
          classify,
          request.signal,
        );
      } catch (error) {
        recordSettled(null);
        throw error;
      }

      let lastUsage: ChatUsage | null = null;
      try {
        for await (const chunk of established) {
          if (chunk.usage) lastUsage = chunk.usage;
          yield chunk;
        }
      } finally {
        // Runs on completion, early consumer break, and mid-stream errors.
        recordSettled(lastUsage);
      }
    },

    usage(): UsageTotals {
      return tracker.totals();
    },
  };
}
