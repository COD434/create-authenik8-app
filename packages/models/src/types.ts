/**
 * Provider-independent model gateway types.
 *
 * Pricing and capability metadata are provider-reported data and MUST be
 * treated as volatile: never assume pricing, free-model availability, or
 * commercial terms are permanent. All values here are snapshots from a
 * discovery call, not constants.
 */

export type ModelPricing = {
  /** USD per prompt token, as reported by the provider. */
  prompt: number;
  /** USD per completion token, as reported by the provider. */
  completion: number;
};

export type ModelInfo = {
  id: string;
  name: string;
  /** Maximum context window in tokens, when the provider reports it. */
  contextLength: number | null;
  /** Input modalities, e.g. ["text"] or ["text", "image"]. */
  inputModalities: string[];
  /** True when the provider advertises tool/function calling support. */
  supportsTools: boolean;
  /** Derived: zero prompt AND completion pricing. Snapshot, not a promise. */
  isFree: boolean;
  /** Null when the provider reports no usable pricing for this model. */
  pricing: ModelPricing | null;
};

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /**
   * Estimated cost in USD from the provider's reported pricing at discovery
   * time. Null when pricing is unknown for the model.
   */
  costUsd: number | null;
};

/** One streamed delta from a chat completion. */
export type ChatChunk = {
  /** Incremental text content, or null for non-content chunks. */
  delta: string | null;
  /** Provider finish reason on the terminating chunk, else null. */
  finishReason: string | null;
  /** Token usage when the provider reports it (typically the final chunk). */
  usage: ChatUsage | null;
};

export type ChatRequest = {
  model: string;
  messages: readonly ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type ChatResult = {
  content: string;
  finishReason: string | null;
  usage: ChatUsage;
  model: string;
};

/**
 * The full provider surface the gateway needs. Establishing a stream
 * (`openChatStream`) performs the HTTP round trip up to response headers, so
 * retry policies can safely wrap establishment and never retry a partially
 * consumed stream.
 */
export type ProviderAdapter = {
  id: string;
  listModels(): Promise<ModelInfo[]>;
  chatCompletion(request: ChatRequest): Promise<ChatResult>;
  openChatStream(request: ChatRequest): Promise<AsyncIterable<ChatChunk>>;
};

export type UsageTotals = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Null until at least one request reports known pricing. */
  costUsd: number | null;
};
