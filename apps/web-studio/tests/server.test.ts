import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ChatChunk, ChatRequest } from "@authenik8/models";

import { createWebStudioServer, type WebStudioDeps } from "../src/server.js";
import { executeTool } from "../src/tools.js";

const KEY = "sk-or-test-key-must-never-leak";

const fakeModels = [
  { id: "free/model-a", name: "Model A", contextLength: 128_000, inputModalities: ["text"], supportsTools: true, isFree: true, pricing: null },
  { id: "paid/model", name: "Paid", contextLength: 200_000, inputModalities: ["text"], supportsTools: true, isFree: false, pricing: { prompt: 0.001, completion: 0.002 } },
  { id: "free/no-tools", name: "No Tools", contextLength: 8_000, inputModalities: ["text"], supportsTools: false, isFree: true, pricing: null },
];

// Scripted rounds: each chatStream call consumes the next entry; the last
// entry repeats when the loop runs longer than the script.
let script: ChatChunk[][];
let roundIndex: number;
let capturedRequests: ChatRequest[];

const fakeGateway = {
  listModels: async () => fakeModels,
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    capturedRequests.push(request);
    const round = script[Math.min(roundIndex, script.length - 1)]!;
    roundIndex++;
    return (async function* () {
      for (const chunk of round) yield chunk;
    })();
  },
};

const textRound: ChatChunk[] = [
  { delta: "Done.", toolCalls: null, finishReason: null, usage: null },
  {
    delta: null,
    toolCalls: null,
    finishReason: "stop",
    usage: { promptTokens: 40, completionTokens: 5, totalTokens: 45, costUsd: null },
  },
];

let sandbox: string;
let capturedKey: string | null = null;

const deps: WebStudioDeps = {
  gatewayFor: (apiKey) => {
    capturedKey = apiKey;
    return fakeGateway;
  },
  sandboxRoot: "", // filled in beforeAll
};

const server = createWebStudioServer(deps);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "a8-studio-test-"));
  deps.sandboxRoot = sandbox;
});

beforeEach(() => {
  script = [];
  roundIndex = 0;
  capturedRequests = [];
});

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});
});

function chat(message: string, model = "free/model-a"): Promise<Response> {
  return fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-OpenRouter-Key": KEY },
    body: JSON.stringify({ model, message }),
  });
}

describe("static UI and auth boundary", () => {
  it("serves the chat shell", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Studio Web");
  });

  it("rejects model discovery and chat without the key header", async () => {
    const models = await fetch(`${base}/api/models`);
    expect(models.status).toBe(401);

    const chatRes = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "free/model-a", message: "hi" }),
    });
    expect(chatRes.status).toBe(401);
    expect(capturedKey).toBeNull();
  });

  it("lists only free, tool-capable models and never echoes the key", async () => {
    const res = await fetch(`${base}/api/models`, { headers: { "X-OpenRouter-Key": KEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["free/model-a"]);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});

describe("agent loop", () => {
  it("executes tool calls and continues to a second round with the tool result", async () => {
    script = [
      [
        { delta: "I'll create the file.", toolCalls: null, finishReason: null, usage: null },
        {
          delta: null,
          toolCalls: [{
            index: 0,
            id: "call_1",
            name: "write_file",
            argumentsDelta: JSON.stringify({ path: "hello.txt", content: "hello from the loop" }),
          }],
          finishReason: null,
          usage: null,
        },
        {
          delta: null,
          toolCalls: null,
          finishReason: "tool_calls",
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30, costUsd: null },
        },
      ],
      textRound,
    ];

    const res = await chat("create hello.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    expect(text).toContain('"delta":"I\'ll create the file."');
    expect(text).toContain('"phase":"start"');
    expect(text).toContain('"phase":"done"');
    expect(text).toContain('"ok":true');
    expect(text).toContain('"done":true');
    expect(text).not.toContain(KEY);

    // The tool really wrote the file inside the sandbox.
    expect(await readFile(path.join(sandbox, "hello.txt"), "utf8")).toBe("hello from the loop");

    // Round 2 saw the assistant tool call and the tool result in history.
    expect(capturedRequests).toHaveLength(2);
    const second = capturedRequests[1]!;
    const toolMessage = second.messages.find((message) => message.role === "tool");
    expect(toolMessage?.toolCallId).toBe("call_1");
    expect(toolMessage?.content).toContain("wrote hello.txt");
    const assistantMessage = second.messages.find((message) => message.role === "assistant");
    expect(assistantMessage?.toolCalls?.[0]?.name).toBe("write_file");
  });

  it("feeds tool failures back to the model instead of crashing", async () => {
    script = [
      [
        {
          delta: null,
          toolCalls: [{
            index: 0,
            id: "call_x",
            name: "write_file",
            argumentsDelta: JSON.stringify({ path: "../escaped.txt", content: "no" }),
          }],
          finishReason: null,
          usage: null,
        },
        { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
      ],
      textRound,
    ];

    const res = await chat("escape the sandbox");
    const text = await res.text();

    expect(text).toContain('"ok":false');
    await expect(readFile(path.resolve(sandbox, "../escaped.txt"))).rejects.toThrow();
    expect(capturedRequests).toHaveLength(2); // loop continued after the failure
  });

  it("stops at the tool round budget", async () => {
    const toolRound: ChatChunk[] = [
      {
        delta: null,
        toolCalls: [{ index: 0, id: "call_y", name: "list_files", argumentsDelta: "{}" }],
        finishReason: null,
        usage: null,
      },
      { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
    ];
    script = [toolRound];

    const res = await chat("loop forever");
    const text = await res.text();

    expect(text).toContain("budget");
    expect(capturedRequests).toHaveLength(6); // MAX_TOOL_ROUNDS
  });
});

describe("conversation state", () => {
  it("keeps history across turns and wipes it on reset", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" }); // tests above share the server conversation
    script = [textRound];
    await (await chat("first message")).text(); // drain: server finishes the turn
    expect(capturedRequests[0]!.messages).toHaveLength(2); // system + user

    script = [textRound];
    await (await chat("second message")).text();
    expect(capturedRequests[1]!.messages).toHaveLength(4); // system + user + assistant + user

    const reset = await fetch(`${base}/api/reset`, { method: "POST" });
    expect(reset.status).toBe(200);

    script = [textRound];
    await (await chat("third message")).text();
    expect(capturedRequests[2]!.messages).toHaveLength(2); // wiped
  });

  it("rejects invalid bodies with 400", async () => {
    const res = await chat("");
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

describe("preview route", () => {
  it("serves sandbox files written by the tools with mapped types and nosniff", async () => {
    const write = await executeTool(
      "write_file",
      JSON.stringify({ path: "index.html", content: "<h1>hello preview</h1>" }),
      sandbox,
    );
    expect(write.ok).toBe(true);

    const home = await fetch(`${base}/preview`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    expect(home.headers.get("x-content-type-options")).toBe("nosniff");
    expect(home.headers.get("cache-control")).toBe("no-store");
    expect(await home.text()).toContain("hello preview");

    await executeTool(
      "write_file",
      JSON.stringify({ path: "assets/style.css", content: "h1 { color: red; }" }),
      sandbox,
    );
    const css = await fetch(`${base}/preview/assets/style.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");

    await executeTool("write_file", JSON.stringify({ path: "icon.png", content: "not really a png" }), sandbox);
    const png = await fetch(`${base}/preview/icon.png`);
    expect(png.headers.get("content-type")).toBe("image/png");
  });

  it("defaults directories to their index.html", async () => {
    await executeTool(
      "write_file",
      JSON.stringify({ path: "sub/index.html", content: "<p>sub page</p>" }),
      sandbox,
    );
    const res = await fetch(`${base}/preview/sub`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("sub page");
  });

  it("refuses traversal, dotfiles, and missing files with 404", async () => {
    // %2e%2e normalizes away in the URL parser; %252e%252e reaches the guard.
    expect((await fetch(`${base}/preview/%252e%252e/package.json`)).status).toBe(404);
    expect((await fetch(`${base}/preview/..%5Cpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/preview/.env`)).status).toBe(404);
    expect((await fetch(`${base}/preview/.git/config`)).status).toBe(404);
    expect((await fetch(`${base}/preview/nope.html`)).status).toBe(404);
  });

  it("405s non-GET preview requests", async () => {
    expect((await fetch(`${base}/preview/`, { method: "POST" })).status).toBe(405);
  });
});
