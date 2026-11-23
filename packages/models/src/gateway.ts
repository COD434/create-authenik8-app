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

function classify(error: unknown): { retryable: boolean; retryAfterMs: number | null } {
  if (error instanceof ModelsError) {
    return { retryable: error.retryable, retryAfterMs: error.retryAfterMs };
  }
  return { retryable: false, retryAfterMs: null };
}

function recordSettled(tracker: UsageTracker, usage: ChatUsage | null): void {
  if (usage !== null) tracker.record(usage);
  tracker.recordRequest();
}

/** Fail closed on the session budget before any provider call is made. */
function budgetGuard(
  maxRequests: number | undefined,
  maxSpendUsd: number | undefined,
  tracker: UsageTracker,
): () => void {
  return function assertBudget(): void {
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
  };
}

type GatewayRuntime = {
  provider: ProviderAdapter;
  policy: RetryPolicy;
  tracker: UsageTracker;
  assertBudget: () => void;
};

async function chatOnce(runtime: GatewayRuntime, request: ChatRequest): Promise<ChatResult> {
  runtime.assertBudget();
  try {
    const result = await withRetries(
      runtime.policy,
      () => runtime.provider.chatCompletion(request),
      classify,
      request.signal,
    );
    recordSettled(runtime.tracker, result.usage);
    return result;
  } catch (error) {
    recordSettled(runtime.tracker, null);
    throw error;
  }
}

async function* streamOnce(runtime: GatewayRuntime, request: ChatRequest): AsyncIterable<ChatChunk> {
  runtime.assertBudget();
  let established: AsyncIterable<ChatChunk>;
  try {
    established = await withRetries(
      runtime.policy,
      () => runtime.provider.openChatStream(request),
      classify,
      request.signal,
    );
  } catch (error) {
    recordSettled(runtime.tracker, null);
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
    recordSettled(runtime.tracker, lastUsage);
  }
}

export function createModelsGateway(options: ModelsGatewayOptions): ModelsGateway {
  const tracker = new UsageTracker();
  const runtime: GatewayRuntime = {
    provider: options.provider,
    policy: resolveRetryPolicy(options.retry),
    tracker,
    assertBudget: budgetGuard(options.budget?.maxRequests, options.budget?.maxSpendUsd, tracker),
  };

  return {
    providerId: runtime.provider.id,

    listModels(): Promise<ModelInfo[]> {
      return runtime.provider.listModels();
    },

    chat(request: ChatRequest): Promise<ChatResult> {
      return chatOnce(runtime, request);
    },

    chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
      return streamOnce(runtime, request);
    },

    usage(): UsageTotals {
      return runtime.tracker.totals();
    },
  };
}
