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

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Assistant messages only: tool calls the model requested. */
  toolCalls?: ToolCall[];
  /** Tool messages only: the id of the tool call this content answers. */
  toolCallId?: string;
};

/**
 * A tool the model may call. JSON-Schema parameters, OpenAI-compatible wire
 * format (sent as `tools: [{ type: "function", function: … }]`).
 */
export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object describing the parameters. */
  parameters: Record<string, unknown>;
};

/** A complete tool call requested by the model (assembled from stream fragments). */
export type ToolCall = {
  id: string;
  name: string;
  /** Provider JSON-encoded arguments string; parse before use. */
  arguments: string;
};

/**
 * One streamed fragment of a tool call. Arguments arrive split across
 * fragments; `id` and `name` appear on the first fragment of each call.
 * `index` is the provider-assigned position within the request.
 */
export type ToolCallDelta = {
  index: number;
  id: string | null;
  name: string | null;
  argumentsDelta: string;
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
  /** Incremental reasoning/thinking content, or null when absent. */
  reasoning: string | null;
  /** Tool-call fragments when this chunk carries them, else null. */
  toolCalls: ToolCallDelta[] | null;
  /** Provider finish reason on the terminating chunk, else null. */
  finishReason: string | null;
  /** Token usage when the provider reports it (typically the final chunk). */
  usage: ChatUsage | null;
};

export type ChatRequest = {
  model: string;
  messages: readonly ChatMessage[];
  /** Tools the model may call; sent with `tool_choice: "auto"`. */
  tools?: readonly ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /** Request reasoning/thinking output from models that support it. */
  reasoning?: boolean;
  signal?: AbortSignal;
};

export type ChatResult = {
  content: string;
  /** Tool calls requested by the model in a non-streaming response. */
  toolCalls: ToolCall[];
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
