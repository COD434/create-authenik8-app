import { describe, expect, it } from "vitest";

import { ModelsError } from "../src/errors.js";
import {
  DEFAULT_RETRY_POLICY,
  delayForAttempt,
  resolveRetryPolicy,
  withRetries,
  type RetryPolicy,
} from "../src/retry.js";

function fastPolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  return { ...DEFAULT_RETRY_POLICY, initialDelayMs: 1, maxDelayMs: 4, jitter: false, ...overrides };
}

const classifyModelsError = (error: unknown) => ({
  retryable: error instanceof ModelsError && error.retryable,
  retryAfterMs: error instanceof ModelsError ? error.retryAfterMs : null,
});

describe("retry policy", () => {
  it("applies defaults and clamps maxAttempts to at least 1", () => {
    expect(resolveRetryPolicy()).toEqual(DEFAULT_RETRY_POLICY);
    expect(resolveRetryPolicy({ maxAttempts: 0 }).maxAttempts).toBe(1);
    expect(resolveRetryPolicy({ maxAttempts: 5 }).maxAttempts).toBe(5);
  });

  it("computes exponential backoff capped by maxDelayMs", () => {
    const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, initialDelayMs: 100, maxDelayMs: 400, jitter: false };
    expect(delayForAttempt(policy, 1, null)).toBe(100);
    expect(delayForAttempt(policy, 2, null)).toBe(200);
    expect(delayForAttempt(policy, 3, null)).toBe(400);
    expect(delayForAttempt(policy, 10, null)).toBe(400);
  });

  it("honours Retry-After hints, capped by maxDelayMs", () => {
    const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, maxDelayMs: 1000, jitter: false };
    expect(delayForAttempt(policy, 1, 5000)).toBe(1000);
    expect(delayForAttempt(policy, 1, 250)).toBe(250);
  });

  it("retries retryable errors up to maxAttempts, then rethrows the last error", async () => {
    let attempts = 0;
    await expect(
      withRetries(
        fastPolicy({ maxAttempts: 3 }),
        async () => {
          attempts += 1;
          throw new ModelsError({ code: "provider_error", message: "down" });
        },
        classifyModelsError,
      ),
    ).rejects.toMatchObject({ code: "provider_error" });
    expect(attempts).toBe(3);
  });

  it("throws non-retryable errors immediately", async () => {
    let attempts = 0;
    await expect(
      withRetries(
        resolveRetryPolicy({ maxAttempts: 5 }),
        async () => {
          attempts += 1;
          throw new ModelsError({ code: "provider_auth", message: "nope" });
        },
        classifyModelsError,
      ),
    ).rejects.toMatchObject({ code: "provider_auth" });
    expect(attempts).toBe(1);
  });

  it("returns the operation value on first success", async () => {
    const value = await withRetries(
      resolveRetryPolicy(),
      async () => 42,
      () => ({ retryable: false, retryAfterMs: null }),
    );
    expect(value).toBe(42);
  });
});
