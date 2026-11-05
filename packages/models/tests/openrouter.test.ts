import { describe, expect, it } from "vitest";

import type { ChatUsage } from "../src/types.js";
import { createOpenRouterProvider } from "../src/openrouter.js";
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
});
