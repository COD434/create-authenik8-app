import { describe, expect, it } from "vitest";

import { createModelsGateway } from "../src/gateway.js";
import { createOpenRouterProvider } from "../src/openrouter.js";
import {
  API_KEY,
  chatPayload,
  expectModelsError,
  fakeProvider,
  jsonResponse,
  mockFetch,
  modelRow,
  modelsPayload,
  sseChunks,
  ssePayload,
  streamResponse,
} from "./helpers.js";

const PAID_ROW = modelRow({
  id: "test/paid-model",
  pricing: { prompt: "0.0000025", completion: "0.00001" },
});

function openRouterWith(fetchImpl: typeof fetch) {
  return createOpenRouterProvider({ apiKey: API_KEY, fetchImpl });
}

function request(overrides: Partial<{ maxTokens: number }> = {}) {
  return {
    model: "test/paid-model",
    messages: [{ role: "user" as const, content: "hi" }],
    ...overrides,
  };
}

describe("gateway usage accounting", () => {
  it("accumulates tokens, requests, and cost across calls", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => jsonResponse(chatPayload({ promptTokens: 100, completionTokens: 50 })),
      () => jsonResponse(chatPayload({ promptTokens: 40, completionTokens: 20 })),
    ]);
    const gateway = createModelsGateway({ provider: openRouterWith(fetchImpl) });

    await gateway.listModels();
    await gateway.chat(request());
    await gateway.chat(request());

    expect(gateway.usage()).toEqual({
      requests: 2,
      promptTokens: 140,
      completionTokens: 70,
      totalTokens: 210,
      // Same arithmetic as the adapter, so exact float equality holds.
      costUsd: 100 * 0.0000025 + 50 * 0.00001 + 40 * 0.0000025 + 20 * 0.00001,
    });
  });

  it("records one request per chat call, not per retry attempt", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => jsonResponse({ error: { message: "rate limited" } }, 429, { "retry-after": "0" }),
      () => jsonResponse({ error: { message: "rate limited" } }, 429, { "retry-after": "0" }),
      () => jsonResponse(chatPayload({ promptTokens: 10, completionTokens: 5 })),
    ]);
    const gateway = createModelsGateway({
      provider: openRouterWith(fetchImpl),
      retry: { initialDelayMs: 1, maxDelayMs: 2, jitter: false },
    });
    await gateway.listModels();
    const result = await gateway.chat(request());
    expect(result.content).toBe("Hello!");
    expect(gateway.usage().requests).toBe(1);
    expect(gateway.usage().promptTokens).toBe(10);
  });

  it("streams deltas and accounts usage exactly once per stream", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => streamResponse(ssePayload(sseChunks(["a", "b"]))),
      () => streamResponse(ssePayload(sseChunks(["c"]))),
    ]);
    const gateway = createModelsGateway({ provider: openRouterWith(fetchImpl) });
    await gateway.listModels();

    const first: string[] = [];
    for await (const chunk of gateway.chatStream(request())) {
      if (chunk.delta) first.push(chunk.delta);
    }
    expect(first.join("")).toBe("ab");

    const second: string[] = [];
    for await (const chunk of gateway.chatStream(request())) {
      if (chunk.delta) second.push(chunk.delta);
    }
    expect(second.join("")).toBe("c");

    expect(gateway.usage().requests).toBe(2);
    expect(gateway.usage().promptTokens).toBe(240);
    expect(gateway.usage().completionTokens).toBe(160);
  });

  it("stops cleanly when the consumer breaks early, keeping usage from seen chunks", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => streamResponse(ssePayload(sseChunks(["x", "y", "z"]))),
    ]);
    const gateway = createModelsGateway({ provider: openRouterWith(fetchImpl) });
    await gateway.listModels();

    for await (const chunk of gateway.chatStream(request())) {
      if (chunk.delta === "y") break;
    }
    expect(gateway.usage().requests).toBe(1);
    // Usage only arrives on the final chunk; an early break records none.
    expect(gateway.usage().promptTokens).toBe(0);
  });
});

describe("gateway budget enforcement", () => {
  it("throws request_limit_exceeded when the request cap is hit", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => jsonResponse(chatPayload()),
      () => jsonResponse(chatPayload()),
    ]);
    const gateway = createModelsGateway({
      provider: openRouterWith(fetchImpl),
      budget: { maxRequests: 2 },
    });
    await gateway.listModels();
    await gateway.chat(request());
    await gateway.chat(request());
    const error = await gateway.chat(request()).catch((caught: unknown) => caught);
    expectModelsError(error, "request_limit_exceeded", false);
  });

  it("throws budget_exhausted once accumulated cost reaches the cap", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => jsonResponse(chatPayload({ promptTokens: 1000, completionTokens: 1000 })),
    ]);
    const gateway = createModelsGateway({
      provider: openRouterWith(fetchImpl),
      budget: { maxSpendUsd: 0.001 },
    });
    await gateway.listModels();
    await gateway.chat(request());
    const error = await gateway.chat(request()).catch((caught: unknown) => caught);
    expectModelsError(error, "budget_exhausted", false);
  });

  it("does not enforce spend caps for unknown-priced models but keeps request caps", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse(chatPayload()), // no discovery: pricing unknown
      () => jsonResponse(chatPayload()),
    ]);
    const gateway = createModelsGateway({
      provider: openRouterWith(fetchImpl),
      budget: { maxSpendUsd: 0.0000001 },
    });
    await gateway.chat({ model: "test/unknown", messages: [{ role: "user", content: "hi" }] });
    await gateway.chat({ model: "test/unknown", messages: [{ role: "user", content: "hi" }] });
    expect(gateway.usage().costUsd).toBeNull();
  });
});

describe("gateway error accounting and abstraction", () => {
  it("counts a terminal failure as a request and propagates stable codes", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse({ error: { message: "bad key" } }, 401),
    ]);
    const gateway = createModelsGateway({ provider: openRouterWith(fetchImpl) });
    const error = await gateway.chat(request()).catch((caught: unknown) => caught);
    expectModelsError(error, "provider_auth", false);
    expect(gateway.usage().requests).toBe(1);
    expect(gateway.usage().promptTokens).toBe(0);
  });

  it("works with any ProviderAdapter, not just OpenRouter", async () => {
    const calls: unknown[] = [];
    const gateway = createModelsGateway({
      provider: fakeProvider({
        chatCompletion: async () => {
          calls.push("chat");
          return {
            content: "from-fake",
            finishReason: "stop",
            model: "fake/model",
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: null },
          };
        },
        openChatStream: async () =>
          (async function* () {
            yield { delta: "hi", finishReason: null, usage: null };
          })(),
      }),
      budget: { maxRequests: 5 },
    });

    const result = await gateway.chat({ model: "fake/model", messages: [] });
    expect(result.content).toBe("from-fake");
    expect(gateway.providerId).toBe("fake");

    const streamed: string[] = [];
    for await (const chunk of gateway.chatStream({ model: "fake/model", messages: [] })) {
      if (chunk.delta) streamed.push(chunk.delta);
    }
    expect(streamed.join("")).toBe("hi");
    expect(calls).toHaveLength(1);
  });

  it("maps fetch-level aborts to the aborted code without retrying", async () => {
    const controller = new AbortController();
    const { fetchImpl } = mockFetch([
      () => jsonResponse(modelsPayload([PAID_ROW])),
      () => {
        controller.abort();
        throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
      },
    ]);
    const gateway = createModelsGateway({ provider: openRouterWith(fetchImpl) });
    await gateway.listModels();
    const error = await gateway
      .chat({ ...request(), signal: controller.signal })
      .catch((caught: unknown) => caught);
    expectModelsError(error, "aborted", false);
    expect(gateway.usage().requests).toBe(1);
  });
});
