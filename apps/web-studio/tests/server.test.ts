import type { AddressInfo } from "node:net";

import { afterAll, describe, expect, it } from "vitest";

import { createWebStudioServer, type WebStudioDeps } from "../src/server.js";

const KEY = "sk-or-test-key-must-never-leak";

const fakeGateway = {
  listModels: async () => [
    { id: "free/model-a", name: "Model A", contextLength: 128_000, inputModalities: ["text"], supportsTools: true, isFree: true, pricing: null },
    { id: "paid/model", name: "Paid", contextLength: 200_000, inputModalities: ["text"], supportsTools: true, isFree: false, pricing: { prompt: 0.001, completion: 0.002 } },
    { id: "free/no-tools", name: "No Tools", contextLength: 8_000, inputModalities: ["text"], supportsTools: false, isFree: true, pricing: null },
  ],
  chatStream: async function* () {
    yield { delta: "Hello", finishReason: null, usage: null };
    yield { delta: " world", finishReason: null, usage: null };
    yield {
      delta: null,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: null },
    };
  },
};

let capturedKey: string | null = null;
const deps: WebStudioDeps = {
  gatewayFor: (apiKey) => {
    capturedKey = apiKey;
    return fakeGateway;
  },
};

const server = createWebStudioServer(deps);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("static UI", () => {
  it("serves the chat shell", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Studio Web");
  });
});

describe("auth boundary", () => {
  it("rejects model discovery and chat without the key header", async () => {
    const models = await fetch(`${base}/api/models`);
    expect(models.status).toBe(401);

    const chat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "free/model-a", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(chat.status).toBe(401);
    expect(capturedKey).toBeNull();
  });
});

describe("model discovery", () => {
  it("lists only free, tool-capable models and never echoes the key", async () => {
    const res = await fetch(`${base}/api/models`, { headers: { "X-OpenRouter-Key": KEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["free/model-a"]);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("chat streaming", () => {
  it("streams SSE deltas, usage, and done over the injected gateway", async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-OpenRouter-Key": KEY },
      body: JSON.stringify({ model: "free/model-a", messages: [{ role: "user", content: "hi" }] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    expect(text).toContain(`data: {"delta":"Hello"}\n\n`);
    expect(text).toContain(`data: {"delta":" world"}\n\n`);
    expect(text).toContain('"done":true');
    expect(text).toContain('"totalTokens":15');
    expect(text).not.toContain(KEY);
    expect(capturedKey).toBe(KEY);
  });

  it("rejects invalid bodies with 400 and never reaches the gateway", async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-OpenRouter-Key": KEY },
      body: JSON.stringify({ model: "", messages: [{ role: "root", content: "" }] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("routing hygiene", () => {
  it("404s unknown paths and 405s wrong API methods", async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/models`, { method: "POST" })).status).toBe(405);
  });

  it("does not serve arbitrary files outside the static map", async () => {
    const traversal = await fetch(`${base}/..%2F..%2Fpackage.json`);
    expect(traversal.status).toBe(404);
  });
});
