/**
 * Explicit, stable error codes for the model gateway. Error messages never
 * include API keys or other caller secrets.
 */

export type ModelsErrorCode =
  | "invalid_config"
  | "provider_auth"
  | "rate_limited"
  | "quota_exhausted"
  | "invalid_request"
  | "provider_error"
  | "network"
  | "aborted"
  | "budget_exhausted"
  | "request_limit_exceeded"
  | "malformed_response";

const RETRYABLE_CODES: ReadonlySet<ModelsErrorCode> = new Set([
  "rate_limited",
  "provider_error",
  "network",
]);

export class ModelsError extends Error {
  readonly code: ModelsErrorCode;
  /** HTTP status when the error came from a provider response. */
  readonly status: number | null;
  readonly retryable: boolean;
  /** Retry hint from the provider's Retry-After header, in milliseconds. */
  readonly retryAfterMs: number | null;

  constructor(options: {
    code: ModelsErrorCode;
    message: string;
    status?: number | null;
    retryAfterMs?: number | null;
  }) {
    super(options.message);
    this.name = "ModelsError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.retryable = RETRYABLE_CODES.has(options.code);
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

/** Map an HTTP status from a provider to a stable error code. */
export function codeForStatus(status: number): ModelsErrorCode {
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "rate_limited";
  if (status === 402) return "quota_exhausted";
  if (status >= 500) return "provider_error";
  return "invalid_request";
}

/** Map a low-level network failure (fetch throw) to a stable error code. */
export function codeForNetworkError(error: unknown): ModelsErrorCode {
  if (error instanceof ModelsError) return error.code;
  if (
    error instanceof Error
    && (error.name === "AbortError"
      || error.name === "TimeoutError"
      || (error as NodeJS.ErrnoException).code === "ABORT_ERR")
  ) {
    return "aborted";
  }
  return "network";
}

/** Parse a Retry-After header value (delta-seconds) into milliseconds. */
export function retryAfterMsFromHeader(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * Truncate untrusted provider response text for inclusion in error messages.
 * Long bodies are cut on a clean boundary and marked.
 */
export function redactBody(text: string, limit = 200): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}
