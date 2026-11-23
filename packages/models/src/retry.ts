import { ModelsError } from "./errors.js";

/**
 * Retry policy: exponential backoff with optional jitter, honouring a
 * provider-provided Retry-After when present. Retries apply only to
 * retryable failures (rate limits, provider 5xx, network) and only while no
 * partial result has been produced.
 */
export type RetryPolicy = {
  /** Total attempts including the first. Minimum 1. */
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Add 0-250 ms of random jitter to computed delays. */
  jitter: boolean;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 400,
  maxDelayMs: 8000,
  jitter: true,
};

export function resolveRetryPolicy(overrides?: Partial<RetryPolicy>): RetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...overrides,
    maxAttempts: Math.max(1, overrides?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts),
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ModelsError({ code: "aborted", message: "Aborted before retry delay completed" }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ModelsError({ code: "aborted", message: "Aborted during retry delay" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Delay before `attempt` (1-based), or null when the error carries no usable
 * hint and the caller should fall back to attempt-independent backoff.
 */
export function delayForAttempt(
  policy: RetryPolicy,
  attempt: number,
  retryAfterMs: number | null,
): number {
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, policy.maxDelayMs);
  }
  const exponential = Math.min(
    policy.initialDelayMs * 2 ** Math.max(0, attempt - 1),
    policy.maxDelayMs,
  );
  const jitter = policy.jitter ? Math.floor(Math.random() * 250) : 0;
  return exponential + jitter;
}

/**
 * Run `operation` under the policy. `classify` decides whether a thrown
 * error is retryable and, when it is, supplies the delay hint (retryAfterMs)
 * for the backoff computation.
 */
export async function withRetries<T>(
  policy: RetryPolicy,
  operation: (attempt: number) => Promise<T>,
  classify: (error: unknown) => { retryable: boolean; retryAfterMs: number | null },
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        throw new ModelsError({ code: "aborted", message: "Aborted during request" });
      }
      const verdict = classify(error);
      if (!verdict.retryable || attempt === policy.maxAttempts) throw error;
      await sleep(delayForAttempt(policy, attempt, verdict.retryAfterMs), signal);
    }
  }
  throw lastError;
}
