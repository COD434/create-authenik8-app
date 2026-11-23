import { z } from "zod";

import {
  ModelsError,
  codeForNetworkError,
  codeForStatus,
  redactBody,
  retryAfterMsFromHeader,
} from "./errors.js";
import { parseSseEvents } from "./sse.js";
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  ModelInfo,
  ModelPricing,
  ProviderAdapter,
  ToolCall,
  ToolCallDelta,
} from "./types.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter adapter (BYOK).
 *
 * API shapes here are snapshots of a third-party service and are parsed
 * defensively with Zod; discovery drops malformed entries rather than
 * failing the whole listing. Do not assume these response shapes are
 * permanent.
 */

export type OpenRouterOptions = {
  /** The user's own OpenRouter API key. Never logged or embedded in errors. */
  apiKey: string;
  /** HTTPS, non-private base URL. Defaults to the OpenRouter public API. */
  baseUrl?: string;
  /** Optional attribution header sent as HTTP-Referer. */
  httpReferer?: string;
  /** Optional attribution header sent as X-Title. */
  appTitle?: string;
  /** Injectable fetch implementation (tests). */
  fetchImpl?: typeof fetch;
};

// --- configuration validation (SSRF guard: BYOK targets public endpoints) ---

const PRIVATE_HOST_PATTERN
  = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|::1$|\[::1\]$|172\.(1[6-9]|2\d|3[01])\.)/;

function validateBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ModelsError({
      code: "invalid_config",
      message: `Provider base URL is not a valid URL: ${redactBody(baseUrl)}`,
    });
  }
  if (url.protocol !== "https:") {
    throw new ModelsError({
      code: "invalid_config",
      message: "Provider base URL must use HTTPS",
    });
  }
  if (PRIVATE_HOST_PATTERN.test(url.hostname)) {
    throw new ModelsError({
      code: "invalid_config",
      message: "Provider base URL must not target a private or loopback host",
    });
  }
  // Keep the base path's last segment during relative resolution: per the URL
  // standard, `new URL("models", ".../api/v1")` would drop "v1" without a
  // trailing slash.
  return url.href.endsWith("/") ? url : new URL(`${url.href}/`);
}

// --- discovery response parsing (tolerant; drop malformed entries) ---

const pricingSchema = z
  .object({
    prompt: z.string().catch("0"),
    completion: z.string().catch("0"),
  })
  .transform((value): ModelPricing | null => {
    const prompt = Number(value.prompt);
    const completion = Number(value.completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
    if (prompt < 0 || completion < 0) return null;
    return { prompt, completion };
  })
  .catch(null);

const modelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().optional().catch(undefined),
  context_length: z.number().optional().catch(undefined),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  supported_parameters: z.array(z.string()).optional().catch(undefined),
  pricing: pricingSchema.optional().catch(undefined),
});

const modelsResponseSchema = z.object({
  data: z.array(z.unknown()),
});

const errorBodySchema = z.object({
  error: z
    .object({
      message: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const chatResponseSchema = z.object({
  model: z.string().optional().catch(undefined),
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.string().nullish().catch(undefined),
            tool_calls: z
              .array(
                z.object({
                  id: z.string().catch(""),
                  function: z
                    .object({
                      name: z.string().catch(""),
                      arguments: z.string().catch(""),
                    })
                    .catch({ name: "", arguments: "" }),
                }),
              )
              .optional()
              .catch(undefined),
          })
          .optional()
          .catch(undefined),
        finish_reason: z.string().nullish().catch(undefined),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional().catch(undefined),
      completion_tokens: z.number().optional().catch(undefined),
      total_tokens: z.number().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const toolCallDeltaSchema = z.object({
  index: z.number().int().catch(0),
  id: z.string().nullish().catch(undefined),
  function: z
    .object({
      name: z.string().nullish().catch(undefined),
      arguments: z.string().nullish().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const chunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish().catch(undefined),
            reasoning: z.string().nullish().catch(undefined),
            reasoning_content: z.string().nullish().catch(undefined),
            tool_calls: z.array(toolCallDeltaSchema).optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
        finish_reason: z.string().nullish().catch(undefined),
      }),
    )
    .optional()
    .catch(undefined),
  usage: z
    .object({
      prompt_tokens: z.number().optional().catch(undefined),
      completion_tokens: z.number().optional().catch(undefined),
      total_tokens: z.number().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

function parsePricing(value: ModelPricing | null | undefined): ModelPricing | null {
  return value ?? null;
}

function toModelInfo(entry: z.infer<typeof modelEntrySchema>): ModelInfo | null {
  if (entry.id.trim() === "") return null;
  const pricing = parsePricing(entry.pricing);
  const isFree = pricing !== null && pricing.prompt === 0 && pricing.completion === 0;
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    contextLength: entry.context_length ?? null,
    inputModalities: entry.architecture?.input_modalities ?? ["text"],
    supportsTools: (entry.supported_parameters ?? []).includes("tools"),
    isFree,
    pricing,
  };
}

// --- adapter ---

/**
 * Map provider-independent messages onto the OpenAI-compatible wire format.
 * Tool results become `role: "tool"` entries; assistant messages carrying
 * tool calls become `tool_calls` entries.
 */
function toWireMessages(messages: readonly ChatMessage[]): unknown {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.toolCallId ?? "", content: message.content };
    }
    if (message.role === "assistant" && message.toolCalls !== undefined && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function errorFromResponse(response: Response, bodyText: string): ModelsError {
  let providerMessage: string | undefined;
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(bodyText));
    providerMessage = parsed.success ? parsed.data.error?.message : undefined;
  } catch {
    providerMessage = undefined;
  }
  return new ModelsError({
    code: codeForStatus(response.status),
    status: response.status,
    retryAfterMs: retryAfterMsFromHeader(response.headers.get("retry-after")),
    message: `Provider responded ${response.status}${providerMessage ? `: ${redactBody(providerMessage)}` : ""}`,
  });
}

export type PublicModelsOptions = {
  /** HTTPS, non-private base URL. Defaults to the OpenRouter public API. */
  baseUrl?: string;
  /** Injectable fetch implementation (tests). */
  fetchImpl?: typeof fetch;
};

/**
 * OpenRouter's model catalog is public data: GET /models needs no API key.
 * Zero-key model browsing in the studio is built on this. BYOK stays intact:
 * no credentials are involved, and this is the same public payload the keyed
 * discovery path parses. Parsed with the same defensive schemas.
 */
export async function listPublicModels(options: PublicModelsOptions = {}): Promise<ModelInfo[]> {
  const baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(new URL("models", baseUrl), {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const code = codeForNetworkError(error);
    throw new ModelsError({
      code,
      message: code === "aborted" ? "Request aborted" : "Provider request failed before a response arrived",
    });
  }
  if (!response.ok) throw errorFromResponse(response, await response.text());

  const parsed = modelsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ModelsError({
      code: "malformed_response",
      message: "Model discovery response did not match the expected shape",
    });
  }
  return parsed.data.data
    .map((entry) => {
      const checked = modelEntrySchema.safeParse(entry);
      return checked.success ? toModelInfo(checked.data) : null;
    })
    .filter((model): model is ModelInfo => model !== null);
}

type RawProviderUsage = {
  prompt_tokens?: number | undefined;
  completion_tokens?: number | undefined;
  total_tokens?: number | undefined;
};

function usageFrom(raw: RawProviderUsage | undefined, pricing: ModelPricing | null): ChatUsage {
  const promptTokens = raw?.prompt_tokens ?? 0;
  const completionTokens = raw?.completion_tokens ?? 0;
  const totalTokens = raw?.total_tokens ?? promptTokens + completionTokens;
  const costUsd = pricing
    ? promptTokens * pricing.prompt + completionTokens * pricing.completion
    : null;
  return { promptTokens, completionTokens, totalTokens, costUsd };
}

function buildRequestHeaders(options: OpenRouterOptions): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
  };
  if (options.httpReferer !== undefined) headers["http-referer"] = options.httpReferer;
  if (options.appTitle !== undefined) headers["x-title"] = options.appTitle;
  return headers;
}

type OpenRouterContext = {
  options: OpenRouterOptions;
  baseUrl: URL;
  fetchImpl: typeof fetch;
  discovery: { cache: ModelInfo[] | null };
};

async function sendProviderRequest(
  context: OpenRouterContext,
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await context.fetchImpl(new URL(path, context.baseUrl), init);
  } catch (error) {
    const code = codeForNetworkError(error);
    throw new ModelsError({
      code,
      message: code === "aborted" ? "Request aborted" : "Provider request failed before a response arrived",
    });
  }
}

async function getCachedPricing(context: OpenRouterContext, modelId: string): Promise<ModelPricing | null> {
  const models = context.discovery.cache;
  if (!models) return null;
  return models.find((model) => model.id === modelId)?.pricing ?? null;
}

function chatCompletionBody(request: ChatRequest, stream: boolean): string {
  return JSON.stringify({
    model: request.model,
    messages: toWireMessages(request.messages),
    stream,
    usage: { include: true },
    ...(request.tools !== undefined
      ? {
          tools: request.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
          tool_choice: "auto",
        }
      : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    ...(request.reasoning === true ? { include_reasoning: true } : {}),
  });
}

async function listModels(context: OpenRouterContext): Promise<ModelInfo[]> {
  if (context.discovery.cache) return context.discovery.cache;
  const response = await sendProviderRequest(context, "models", {
    method: "GET",
    headers: buildRequestHeaders(context.options),
  });
  if (!response.ok) {
    throw errorFromResponse(response, await response.text());
  }
  const parsed = modelsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ModelsError({
      code: "malformed_response",
      message: "Model discovery response did not match the expected shape",
    });
  }
  context.discovery.cache = parsed.data.data
    .map((entry) => {
      const checked = modelEntrySchema.safeParse(entry);
      return checked.success ? toModelInfo(checked.data) : null;
    })
    .filter((model): model is ModelInfo => model !== null);
  return context.discovery.cache;
}

async function chatCompletion(context: OpenRouterContext, request: ChatRequest): Promise<ChatResult> {
  const response = await sendProviderRequest(context, "chat/completions", {
    method: "POST",
    headers: buildRequestHeaders(context.options),
    body: chatCompletionBody(request, false),
    ...(request.signal ? { signal: request.signal } : {}),
  });
  if (!response.ok) {
    throw errorFromResponse(response, await response.text());
  }
  const parsed = chatResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ModelsError({
      code: "malformed_response",
      message: "Chat completion response did not match the expected shape",
    });
  }
  const choice = parsed.data.choices[0]!;
  const pricing = await getCachedPricing(context, request.model);
  const toolCalls: ToolCall[] = (choice.message?.tool_calls ?? [])
    .filter((call) => call.id !== "" && call.function.name !== "")
    .map((call) => ({ id: call.id, name: call.function.name, arguments: call.function.arguments }));
  return {
    content: choice.message?.content ?? "",
    toolCalls,
    finishReason: choice.finish_reason ?? null,
    usage: usageFrom(parsed.data.usage, pricing),
    model: parsed.data.model ?? request.model,
  };
}

async function openChatStream(context: OpenRouterContext, request: ChatRequest): Promise<AsyncIterable<ChatChunk>> {
  const response = await sendProviderRequest(context, "chat/completions", {
    method: "POST",
    headers: buildRequestHeaders(context.options),
    body: chatCompletionBody(request, true),
    ...(request.signal ? { signal: request.signal } : {}),
  });
  if (!response.ok) {
    throw errorFromResponse(response, await response.text());
  }
  if (response.body === null) {
    throw new ModelsError({
      code: "malformed_response",
      message: "Provider stream closed without a body",
    });
  }

  const body = response.body;
  async function* iterate(): AsyncIterable<ChatChunk> {
    for await (const data of parseSseEvents(body)) {
      if (data === "[DONE]") break;
      let parsedChunk: z.infer<typeof chunkSchema>;
      try {
        const json: unknown = JSON.parse(data);
        const check = chunkSchema.safeParse(json);
        if (!check.success) continue;
        parsedChunk = check.data;
      } catch {
        continue;
      }
      const choice = parsedChunk.choices?.[0];
      const usage = parsedChunk.usage
        ? usageFrom(parsedChunk.usage, await getCachedPricing(context, request.model))
        : null;
      const toolCallDeltas: ToolCallDelta[] = (choice?.delta?.tool_calls ?? []).map((fragment) => ({
        index: fragment.index,
        id: fragment.id ?? null,
        name: fragment.function?.name ?? null,
        argumentsDelta: fragment.function?.arguments ?? "",
      }));
      yield {
        delta: choice?.delta?.content ?? null,
        reasoning: choice?.delta?.reasoning ?? choice?.delta?.reasoning_content ?? null,
        toolCalls: toolCallDeltas.length > 0 ? toolCallDeltas : null,
        finishReason: choice?.finish_reason ?? null,
        usage,
      };
    }
  }

  return iterate();
}

export function createOpenRouterProvider(options: OpenRouterOptions): ProviderAdapter {
  if (typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
    throw new ModelsError({
      code: "invalid_config",
      message: "An OpenRouter API key is required (BYOK)",
    });
  }
  const baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const context: OpenRouterContext = {
    options,
    baseUrl,
    fetchImpl,
    discovery: { cache: null },
  };

  const provider: ProviderAdapter = {
    id: "openrouter",
    listModels: () => listModels(context),
    chatCompletion: (request) => chatCompletion(context, request),
    openChatStream: (request) => openChatStream(context, request),
  };

  return provider;
}
