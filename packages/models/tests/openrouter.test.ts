import { describe, expect, it } from "vitest";

import type { ChatUsage, ToolCallDelta } from "../src/types.js";
import { createOpenRouterProvider } from "../src/openrouter.js";
import { assembleToolCalls } from "../src/tools.js";
import {
  API_KEY,
  chatPayload,
  jsonResponse,
  mockFetch,
  modelRow,
  modelsPayload,
  streamResponse,
  ssePayload,
  sseChunks,
} from "./helpers.js";

describe("openrouter model discovery", () => {
  it("parses models with capability metadata and derives isFree", async () => {
    const { fetchImpl, calls } = mockFetch([
      () =>
        jsonResponse(
          modelsPayload([
            modelRow(),
            modelRow({
              id: "test/paid-model",
              name: "Test Paid Model",
              supported_parameters: [],
              pricing: { prompt: "0.0000025", completion: "0.00001" },
            }),
            modelRow({ id: "test/vision-model", architecture: { input_modalities: ["text", "image"] } }),
            { broken: true },
          ]),
        ),
    ]);

    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    const models = await provider.listModels();

    expect(models).toHaveLength(3);
    const free = models.find((model) => model.id === "test/free-model")!;
    expect(free.isFree).toBe(true);
    expect(free.supportsTools).toBe(true);
    expect(free.contextLength).toBe(128000);
    expect(free.pricing).toEqual({ prompt: 0, completion: 0 });
    const paid = models.find((model) => model.id === "test/paid-model")!;
    expect(paid.isFree).toBe(false);
    expect(paid.supportsTools).toBe(false);
    const vision = models.find((model) => model.id === "test/vision-model")!;
    expect(vision.inputModalities).toEqual(["text", "image"]);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/models");
    expect(calls[0]!.init.headers).toMatchObject({ authorization: `Bearer ${API_KEY}` });
  });

  it("caches discovery per session", async () => {
    const { fetchImpl, calls } = mockFetch([() => jsonResponse(modelsPayload([modelRow()]))]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    await provider.listModels();
    await provider.listModels();
    expect(calls).toHaveLength(1);
  });

  it("maps provider error statuses to stable codes", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse({ error: { message: "No auth credentials found" } }, 401),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.listModels()).rejects.toMatchObject({
      code: "provider_auth",
      retryable: false,
    });
  });
});

describe("openrouter config validation", () => {
  it("rejects missing keys, plaintext URLs, and private hosts at construction", () => {
    expect(() => createOpenRouterProvider({ apiKey: "" })).toThrowError(/API key is required/);
    expect(() =>
      createOpenRouterProvider({ apiKey: API_KEY, baseUrl: "http://openrouter.ai/api/v1" }),
    ).toThrowError(/HTTPS/);
    expect(() =>
      createOpenRouterProvider({ apiKey: API_KEY, baseUrl: "https://127.0.0.1/api/v1" }),
    ).toThrowError(/private or loopback/);
    expect(() =>
      createOpenRouterProvider({ apiKey: API_KEY, baseUrl: "https://10.0.0.9/api/v1" }),
    ).toThrowError(/private or loopback/);
    expect(() =>
      createOpenRouterProvider({ apiKey: API_KEY, baseUrl: "not a url" }),
    ).toThrowError(/not a valid URL/);
  });
});

describe("openrouter chat completions", () => {
  it("returns content, usage, and cost estimated from discovered pricing", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => jsonResponse(modelsPayload([modelRow({
        id: "test/paid-model",
        pricing: { prompt: "0.0000025", completion: "0.00001" },
      })])),
      () => jsonResponse(chatPayload({ promptTokens: 100, completionTokens: 50 })),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    await provider.listModels();

    const result = await provider.chatCompletion({
      model: "test/paid-model",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.content).toBe("Hello!");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.promptTokens).toBe(100);
    expect(result.usage.completionTokens).toBe(50);
    // 100 * 0.0000025 + 50 * 0.00001 = 0.00075
    expect(result.usage.costUsd).toBeCloseTo(0.00075, 10);

    const chatCall = calls[1]!;
    expect(chatCall.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(String(chatCall.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "test/paid-model", stream: false });
    expect(chatCall.init.headers).toMatchObject({ authorization: `Bearer ${API_KEY}` });
  });

  it("reports null cost when the model was never discovered", async () => {
    const { fetchImpl } = mockFetch([() => jsonResponse(chatPayload())]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    const result = await provider.chatCompletion({
      model: "test/unknown-model",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.usage.costUsd).toBeNull();
  });

  it("surfaces provider error bodies truncated without leaking the key", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse({ error: { message: "This model is temporarily overloaded" } }, 502),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    const error = await provider
      .chatCompletion({ model: "m", messages: [{ role: "user", content: "hi" }] })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "provider_error", retryable: true, status: 502 });
    expect((error as Error).message).toContain("temporarily overloaded");
    expect((error as Error).message).not.toContain(API_KEY);
  });
});

describe("openrouter streaming", () => {
  it("streams deltas and reports final usage with cost", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([modelRow({
        id: "test/paid-model",
        pricing: { prompt: "0.0000025", completion: "0.00001" },
      })])),
      () =>
        streamResponse(
          ssePayload(sseChunks(["Hel", "lo ", "world"]), { withUsage: true }),
        ),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    await provider.listModels();

    const stream = await provider.openChatStream({
      model: "test/paid-model",
      messages: [{ role: "user", content: "hi" }],
    });
    const deltas: string[] = [];
    let usage: ChatUsage | null = null;
    for await (const chunk of stream) {
      if (chunk.delta !== null) deltas.push(chunk.delta);
      if (chunk.usage) usage = chunk.usage;
    }
    expect(deltas.join("")).toBe("Hello world");
    expect(usage).toMatchObject({ promptTokens: 120, completionTokens: 80, totalTokens: 200 });
    expect(usage?.costUsd).toBeCloseTo(120 * 0.0000025 + 80 * 0.00001, 10);
  });

  it("yields null toolCalls for text-only chunks", async () => {
    const { fetchImpl } = mockFetch([
      () => streamResponse(ssePayload(sseChunks(["hi"]), { withUsage: false })),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    const stream = await provider.openChatStream({
      model: "test/free-model",
      messages: [{ role: "user", content: "hi" }],
    });
    for await (const chunk of stream) {
      expect(chunk.toolCalls).toBeNull();
    }
  });
});

describe("openrouter tool support", () => {
  it("sends tools with tool_choice auto and streams tool-call fragments", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => jsonResponse(modelsPayload([modelRow()])),
      () =>
        streamResponse(
          ssePayload([
            {
              choices: [{
                delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "write_file", arguments: "{\"pa" } }] },
                finish_reason: null,
              }],
            },
            {
              choices: [{
                delta: { tool_calls: [{ index: 0, function: { arguments: "th\": \"index.html\"}" } }] },
                finish_reason: null,
              }],
            },
            { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
          ], { withUsage: true }),
        ),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    await provider.listModels();

    const stream = await provider.openChatStream({
      model: "test/free-model",
      messages: [{ role: "user", content: "make a file" }],
      tools: [{ name: "write_file", description: "Write a file", parameters: { type: "object" } }],
    });

    const body = JSON.parse(String(calls[1]!.init.body)) as Record<string, unknown>;
    expect(body.tools).toEqual([
      { type: "function", function: { name: "write_file", description: "Write a file", parameters: { type: "object" } } },
    ]);
    expect(body.tool_choice).toBe("auto");

    const fragments: ToolCallDelta[] = [];
    let finish: string | null = null;
    for await (const chunk of stream) {
      if (chunk.toolCalls !== null) fragments.push(...chunk.toolCalls);
      if (chunk.finishReason !== null) finish = chunk.finishReason;
    }
    expect(finish).toBe("tool_calls");
    expect(assembleToolCalls(fragments)).toEqual([
      { id: "call_1", name: "write_file", arguments: '{"path": "index.html"}' },
    ]);
  });

  it("maps assistant tool_calls and tool results onto the provider wire format", async () => {
    const { fetchImpl, calls } = mockFetch([() => jsonResponse(chatPayload())]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    await provider.chatCompletion({
      model: "test/paid-model",
      messages: [
        { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "write_file", arguments: "{}" }] },
        { role: "tool", content: "ok", toolCallId: "call_1" },
      ],
    });
    const body = JSON.parse(String(calls[0]!.init.body)) as { messages: unknown[] };
    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "write_file", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "ok" },
    ]);
  });

  it("parses non-streaming tool calls into ChatResult and drops malformed entries", async () => {
    const { fetchImpl } = mockFetch([
      () =>
        jsonResponse({
          model: "test/paid-model",
          choices: [{
            message: {
              content: null,
              tool_calls: [
                { id: "call_9", type: "function", function: { name: "list_files", arguments: "{}" } },
                { id: "", function: { name: "no_id", arguments: "{}" } },
              ],
            },
            finish_reason: "tool_calls",
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
    ]);
    const provider = createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
    const result = await provider.chatCompletion({
      model: "test/paid-model",
      messages: [{ role: "user", content: "list" }],
    });
    expect(result.content).toBe("");
    expect(result.toolCalls).toEqual([{ id: "call_9", name: "list_files", arguments: "{}" }]);
  });
});
