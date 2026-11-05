import { expect } from "vitest";

import type { ChatChunk, ChatRequest, ChatResult, ModelInfo } from "../src/types.js";
import type { ModelsErrorCode } from "../src/errors.js";
import { ModelsError } from "../src/errors.js";

export const API_KEY = "sk-or-test-0000000000000000000000000000000000";

export const TEST_PRICING = { prompt: 0.0000025, completion: 0.00001 };

export function modelRow(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    id: "test/free-model",
    name: "Test Free Model",
    context_length: 128000,
    architecture: { input_modalities: ["text"] },
    supported_parameters: ["tools"],
    pricing: { prompt: "0", completion: "0" },
    ...overrides,
  };
}

export function modelsPayload(rows: unknown[]): unknown {
  return { data: rows };
}

export function chatPayload(overrides: {
  content?: string;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
} = {}): unknown {
  return {
    model: overrides.model ?? "test/paid-model",
    choices: [
      {
        message: { content: overrides.content ?? "Hello!" },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: overrides.promptTokens ?? 100,
      completion_tokens: overrides.completionTokens ?? 50,
      total_tokens: (overrides.promptTokens ?? 100) + (overrides.completionTokens ?? 50),
    },
  };
}

/** One SSE stream as an array of encoded chunks. */
export function ssePayload(events: unknown[], { withUsage = true } = {}): Uint8Array[] {
  const lines: string[] = [": OPENROUTER PROCESSING"];
  for (const [index, event] of events.entries()) {
    lines.push(`data: ${JSON.stringify(event)}`);
  }
  if (withUsage) {
    lines.push(
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: null }],
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
      })}`,
    );
  }
  lines.push("data: [DONE]", "");
  const encoder = new TextEncoder();
  const text = lines.join("\n");
  return [encoder.encode(text.slice(0, Math.ceil(text.length / 2))), encoder.encode(text.slice(Math.ceil(text.length / 2)))];
}

export function sseChunks(deltas: string[]): unknown[] {
  return deltas.map((delta) => ({
    choices: [{ delta: { content: delta }, finish_reason: null }],
  }));
}

export type RecordedCall = { url: string; init: RequestInit };

/**
 * Build an injectable fetch implementation. Each handler consumes one call;
 * the last handler repeats for extra calls.
 */
export function mockFetch(
  handlers: Array<(url: string, init: RequestInit) => Response>,
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    const handler = handlers[Math.min(calls.length - 1, handlers.length - 1)]!;
    return handler(url, requestInit);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

export function jsonResponse(payload: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function textResponse(body: string, status: number, headers?: Record<string, string>): Response {
  return new Response(body, { status, headers });
}

export function streamResponse(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

export function expectModelsError(error: unknown, code: ModelsErrorCode, retryable: boolean): ModelsError {
  expect(error).toBeInstanceOf(ModelsError);
  const modelsError = error as ModelsError;
  expect(modelsError.code).toBe(code);
  expect(modelsError.retryable).toBe(retryable);
  expect(modelsError.message).not.toContain(API_KEY);
  return modelsError;
}

/** A second provider proving the gateway is adapter-agnostic. */
export function fakeProvider(handlers: {
  listModels?: () => Promise<ModelInfo[]>;
  chatCompletion?: (request: ChatRequest) => Promise<ChatResult>;
  openChatStream?: () => Promise<AsyncIterable<ChatChunk>>;
}): {
  id: string;
  listModels: () => Promise<ModelInfo[]>;
  chatCompletion: (request: ChatRequest) => Promise<ChatResult>;
  openChatStream: () => Promise<AsyncIterable<ChatChunk>>;
} {
  return {
    id: "fake",
    listModels: handlers.listModels ?? (async () => []),
    chatCompletion: handlers.chatCompletion ?? (async () => {
      throw new Error("not implemented");
    }),
    openChatStream: handlers.openChatStream ?? (async () => {
      throw new Error("not implemented");
    }),
  };
}
