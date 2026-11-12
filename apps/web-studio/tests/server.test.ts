import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRunResult, AgentRuntime } from "@authenik8/agent-adapter";
import type { ChatChunk, ChatRequest } from "@authenik8/models";

import { createWebStudioServer, startStudio, type WebStudioDeps } from "../src/server.js";
import { SessionLog } from "../src/session-log.js";
import { PROJECT_DIR_NAME } from "../src/template-bridge.js";
import { executeTool } from "../src/tools.js";
import type { Runner, RunnerCommands, RunnerEvent, RunnerHandlers } from "../src/runner.js";
import type { AgentStreamEvent } from "@authenik8/agent-adapter";

const KEY = "sk-or-test-key-must-never-leak";

const fakeModels = [
  { id: "free/model-a", name: "Model A", contextLength: 128_000, inputModalities: ["text"], supportsTools: true, isFree: true, pricing: null },
  { id: "paid/model", name: "Paid", contextLength: 200_000, inputModalities: ["text"], supportsTools: true, isFree: false, pricing: { prompt: 0.001, completion: 0.002 } },
  { id: "free/no-tools", name: "No Tools", contextLength: 8_000, inputModalities: ["text"], supportsTools: false, isFree: true, pricing: null },
  { id: "openrouter/free", name: "Free auto-router", contextLength: 200_000, inputModalities: ["text"], supportsTools: true, isFree: true, pricing: null },
];

// Scripted rounds: each chatStream call consumes the next entry; the last
// entry repeats when the loop runs longer than the script. A `{ throw }`
// entry makes the stream fail with that error (provider-level refusal).
type ScriptEntry = ChatChunk[] | { throw: string };
let script: ScriptEntry[];
let roundIndex: number;
let capturedRequests: ChatRequest[];

const fakeGateway = {
  listModels: async () => fakeModels,
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    capturedRequests.push(request);
    const entry = script[Math.min(roundIndex, script.length - 1)]!;
    roundIndex++;
    if ("throw" in entry) {
      const refusal = (entry as { throw: string }).throw;
      return (async function* () {
        throw new Error(refusal);
      })();
    }
    return (async function* () {
      for (const chunk of entry as ChatChunk[]) yield chunk;
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

// Agent fake: captures the request, waits for the test to resolve the run.
let resolveRun: ((result: AgentRunResult) => void) | null = null;
const agentCalls: Array<{
  prompt: string;
  cwd?: string;
  autoApprove?: boolean;
  onEvent?: ((event: AgentStreamEvent) => void) | undefined;
}> = [];
const fakeRuntime: AgentRuntime = {
  id: "opencode",
  run(request) {
    agentCalls.push({
      prompt: request.prompt,
      cwd: request.cwd,
      autoApprove: request.autoApprove,
      onEvent: request.onEvent,
    });
    return new Promise<AgentRunResult>((resolve) => {
      resolveRun = resolve;
    });
  },
};

const agentSuccess: AgentRunResult = {
  ok: true,
  runtime: "opencode",
  command: ["opencode", "run", "--format", "json", "--auto", "--", "brief"],
  exitCode: 0,
  timedOut: false,
  durationMs: 1_500,
  stdout: "created project files",
  stderr: "",
  errorCode: null,
  sessionId: "ses_abc",
};

// Runner fake: controlled isRunning, captured handlers for event injection,
// and the last commands handed to start (the route composes them per run).
let fakeRunnerRunning = false;
let fakeRunnerStarted = 0;
let fakeRunnerStopped = 0;
let fakeRunnerCommands: RunnerCommands = null;
let runnerHandlers: RunnerHandlers | null = null;

const fakeRunner: Runner = {
  start: (_cwd, commands) => {
    fakeRunnerStarted++;
    fakeRunnerCommands = commands;
    return true;
  },
  stop: () => {
    fakeRunnerStopped++;
  },
  isRunning: () => fakeRunnerRunning,
};

const fakeCreateRunner = (handlers: RunnerHandlers): Runner => {
  runnerHandlers = handlers;
  return fakeRunner;
};

const deps: WebStudioDeps = {
  gatewayFor: (apiKey) => {
    capturedKey = apiKey;
    return fakeGateway;
  },
  publicModels: async () => fakeModels,
  sandboxRoot: "", // filled in beforeAll
  agentRuntime: fakeRuntime,
  createRunner: fakeCreateRunner,
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
  agentCalls.length = 0;
  resolveRun = null;
  fakeRunnerRunning = false;
  fakeRunnerStarted = 0;
  fakeRunnerStopped = 0;
  fakeRunnerCommands = null;
  // runnerHandlers stays: the server captured its handler closures once at
  // module load and they are stateless.
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
  it("serves the chat shell, never cacheable (a stale tab must not outlive a fix)", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toContain("<title>Authenik8</title>");

    const appJs = await fetch(`${base}/app.js`);
    expect(appJs.headers.get("cache-control")).toContain("no-store");
    const style = await fetch(`${base}/style.css`);
    expect(style.headers.get("cache-control")).toContain("no-store");
    // The real brand mark must serve same-origin: favicon, sidebar, hero,
    // and avatars all point at it (no CDNs, ever).
    const logo = await fetch(`${base}/authenik8-logo.svg`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toContain("image/svg+xml");
    expect(logo.headers.get("cache-control")).toContain("no-store");
    // The trimmed mark fills the frame: it is what the sidebar, favicon,
    // and small surfaces use (the poster art dies at 36px).
    const mark = await fetch(`${base}/authenik8-mark.svg`);
    expect(mark.status).toBe(200);
    expect(mark.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("browses free models with NO key, and still refuses chat without one", async () => {
    const models = await fetch(`${base}/api/models`);
    expect(models.status).toBe(200);
    const body = await models.json();
    // Paid and non-tool-capable models are filtered; the app-traffic auto-
    // router leads so the zero-click default is a working model.
    expect(body.models.map((m: { id: string }) => m.id)).toEqual(["openrouter/free", "free/model-a"]);

    const chatRes = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openrouter/free", message: "hi" }),
    });
    expect(chatRes.status).toBe(401);
    expect((await chatRes.json()).error).toContain("X-OpenRouter-Key");
    expect(capturedKey).toBeNull(); // a keyless request never builds a gateway
  });

  it("lists only free, tool-capable models and never echoes the key", async () => {
    const res = await fetch(`${base}/api/models`, { headers: { "X-OpenRouter-Key": KEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["openrouter/free", "free/model-a"]);
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

    // Round 2 saw the assistant tool call, the tool result, and a refreshed
    // runtime context that now includes the file the tool created.
    expect(capturedRequests).toHaveLength(2);
    const second = capturedRequests[1]!;
    const toolMessage = second.messages.find((message) => message.role === "tool");
    expect(toolMessage?.toolCallId).toBe("call_1");
    expect(toolMessage?.content).toContain("wrote hello.txt");
    const assistantMessage = second.messages.find((message) => message.role === "assistant");
    expect(assistantMessage?.toolCalls?.[0]?.name).toBe("write_file");
    const contexts = second.messages.filter(
      (message) => message.role === "system" && message.content.startsWith("<runtime-context>"),
    );
    expect(contexts).toHaveLength(2);
    expect(contexts.at(-1)?.content).toContain("hello.txt");
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

describe("model fallback", () => {
  const agentsOnly = "Provider responded 403: unsupported/model:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps";

  it("completes the message with the fallback router when the chosen model rejects app traffic", async () => {
    script = [
      { throw: agentsOnly },
      textRound,
    ];

    const res = await chat("build it", "unsupported/model:free");
    const text = await res.text();

    expect(text).toContain('"note":"unsupported/model:free rejects app traffic');
    expect(text).toContain("openrouter/free");
    expect(text).toContain('"delta":"Done."');
    expect(text).toContain('"done":true');

    // Attempt 1 was the refused model; attempt 2 was the fallback router.
    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[0]!.model).toBe("unsupported/model:free");
    expect(capturedRequests[1]!.model).toBe("openrouter/free");
  });

  it("does not double-fallback when the fallback model itself is refused", async () => {
    script = [
      { throw: "Provider responded 403: openrouter/free is only available on agentic harnesses. x" },
    ];

    const res = await chat("build it", "openrouter/free");
    const text = await res.text();

    expect(text).toContain("agentic harnesses");
    expect(text).not.toContain('"note"');
    expect(capturedRequests).toHaveLength(1); // no retry on the same model
  });
});

describe("conversation state", () => {
  it("keeps history across turns and wipes it on reset", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" }); // tests above share the server conversation
    script = [textRound];
    await (await chat("first message")).text(); // drain: server finishes the turn
    expect(capturedRequests[0]!.messages).toHaveLength(3); // system + runtime context + user
    expect(capturedRequests[0]!.messages.some(
      (message) => message.role === "system" && message.content.startsWith("<runtime-context>"),
    )).toBe(true);

    script = [textRound];
    await (await chat("second message")).text();
    expect(capturedRequests[1]!.messages).toHaveLength(5); // + assistant + user; context deduped

    const reset = await fetch(`${base}/api/reset`, { method: "POST" });
    expect(reset.status).toBe(200);

    script = [textRound];
    await (await chat("third message")).text();
    expect(capturedRequests[2]!.messages).toHaveLength(3); // fresh context + user
  });

  it("restores the conversation from the sandbox log after a restart", async () => {
    await fetch(`${base}/api/reset`, { method: "POST" });
    script = [textRound];
    await (await chat("durable hello")).text();

    // A fresh server over the same sandbox derives the same conversation:
    // the log, not process memory, is the source of truth.
    const second = createWebStudioServer({
      ...deps,
      createRunner: () => fakeRunner, // do not steal the primary server's runner handlers
    });
    await new Promise<void>((resolve) => second.listen(0, "127.0.0.1", resolve));
    const secondPort = (second.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${secondPort}/api/history`);
      expect(res.status).toBe(200);
      const body = await res.json() as { messages: Array<{ role: string; content: string }> };
      const visible = body.messages.filter((message) => message.role !== "system");
      expect(visible.map((message) => message.role)).toEqual(["user", "assistant"]);
      expect(visible[0]?.content).toBe("durable hello");
      expect(visible[1]?.content).toBe("Done.");
      expect(body.messages.some(
        (message) => message.role === "system" && message.content.startsWith("<runtime-context>"),
      )).toBe(true);
    } finally {
      second.closeAllConnections();
      second.close();
    }
  });

  it("rejects invalid bodies with 400", async () => {
    const res = await chat("");
    expect(res.status).toBe(400);
  });
});

describe("context compaction", () => {
  it("compacts the request view while the durable log keeps the full result", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "a8-compact-test-"));
    try {
      const seed = new SessionLog(path.join(dir, ".authenik8", "session.jsonl"));
      await seed.append({ role: "user", content: "earlier build" });
      await seed.append({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "old_call", name: "read_file", arguments: "{}" }],
      });
      await seed.append({ role: "tool", toolCallId: "old_call", content: "x".repeat(6_000) });
      await seed.append({ role: "assistant", content: "that file is large" });
      await seed.append({ role: "user", content: "now add auth" });
      await seed.append({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "new_call", name: "list_files", arguments: "{}" }],
      });
      await seed.append({ role: "tool", toolCallId: "new_call", content: "src/\npackage.json" });
      await seed.append({ role: "assistant", content: "ready" });

      const compactServer = createWebStudioServer({
        ...deps,
        sandboxRoot: dir,
        contextBudgetChars: 2_000,
        createRunner: () => fakeRunner,
      });
      await new Promise<void>((resolve) => compactServer.listen(0, "127.0.0.1", resolve));
      const compactPort = (compactServer.address() as AddressInfo).port;
      try {
        capturedRequests.length = 0;
        roundIndex = 0;
        script = [textRound];
        const res = await fetch(`http://127.0.0.1:${compactPort}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-openrouter-key": KEY },
          body: JSON.stringify({ message: "continue", model: "free/model-a" }),
        });
        const text = await res.text();
        expect(text).toContain('"compaction"');

        const sent = capturedRequests[0]!.messages;
        const compacted = sent.find(
          (message) => message.role === "tool" && message.toolCallId === "old_call",
        );
        expect(compacted?.content).toContain("[compacted tool result] read_file");
        expect(compacted?.content).not.toContain("x".repeat(1_000));

        const historyRes = await fetch(`http://127.0.0.1:${compactPort}/api/history`);
        const history = await historyRes.json() as {
          messages: Array<{ role: string; toolCallId?: string; content: string }>;
        };
        const full = history.messages.find(
          (message) => message.role === "tool" && message.toolCallId === "old_call",
        );
        expect(full?.content).toHaveLength(6_000);
      } finally {
        compactServer.closeAllConnections();
        compactServer.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
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

  it("rejects malformed chat JSON with 400 instead of 500", async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "x-openrouter-key": "sk-test", "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
});

describe("preview route", () => {  it("serves sandbox files written by the tools with mapped types and nosniff", async () => {
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

describe("build agent route", () => {
  function runAgent(prompt: string): Promise<Response> {
    return fetch(`${base}/api/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  }

  it("runs the agent in the sandbox with auto-approve and streams the outcome", async () => {
    const pending = runAgent("a barbershop booking app");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    expect(agentCalls[0]!.cwd).toBe(sandbox);
    expect(agentCalls[0]!.autoApprove).toBe(true);
    expect(agentCalls[0]!.prompt).toContain("a barbershop booking app");
    expect(agentCalls[0]!.prompt).toContain("Authenik8"); // doctrine preamble

    resolveRun!(agentSuccess);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    expect(text).toContain('"phase":"start"');
    expect(text).toContain('"phase":"done"');
    expect(text).toContain('"ok":true');
    expect(text).toContain('"sessionId":"ses_abc"');
    expect(text).toContain("created project files");
  });

  it("relays live runtime events as data while the run is in flight", async () => {
    const pending = runAgent("build with live events");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    // Events emitted mid-run, before the final result resolves.
    agentCalls[0]!.onEvent?.({ index: 0, data: { type: "step", part: "start" } });
    agentCalls[0]!.onEvent?.({ index: 1, data: { type: "tool", name: "write_file" } });

    resolveRun!(agentSuccess);
    const text = await (await pending).text();

    expect(text).toContain('"agentEvent"');
    expect(text).toContain('"type":"step"');
    expect(text).toContain('"name":"write_file"');
    expect(text).toContain('"phase":"done"'); // final result still streams
  });

  it("rejects a second agent run while one is in progress", async () => {
    const first = runAgent("first build");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    const second = await runAgent("second build");
    expect(second.status).toBe(409);

    resolveRun!(agentSuccess);
    expect((await first).status).toBe(200);
  });

  it("streams agent failures as data with the structured error code", async () => {
    const pending = runAgent("build me something");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    resolveRun!({
      ...agentSuccess,
      ok: false,
      exitCode: null,
      errorCode: "runtime_missing",
      sessionId: null,
      stdout: "",
      stderr: "opencode executable not found",
    });
    const text = await (await pending).text();

    expect(text).toContain('"ok":false');
    expect(text).toContain('"errorCode":"runtime_missing"');
    expect(text).toContain("opencode executable not found");
  });

  it("rejects invalid bodies with 400 and never reaches the runtime", async () => {
    const res = await runAgent("");
    expect(res.status).toBe(400);
    expect(agentCalls).toHaveLength(0);
  });

  it("rejects malformed JSON with 400 instead of 500", async () => {
    const res = await fetch(`${base}/api/agent`, { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(agentCalls).toHaveLength(0);
  });

  it("bootstraps a missing sandbox directory before the runtime runs", async () => {
    const fresh = path.join(sandbox, "bootstrap-agent");
    deps.sandboxRoot = fresh;
    try {
      const pending = runAgent("bootstrap test");
      await vi.waitFor(() => expect(agentCalls).toHaveLength(1));
      // mkdir ran before the runtime call: the cwd is already real.
      expect(existsSync(agentCalls[0]!.cwd!)).toBe(true);
      resolveRun!(agentSuccess);
      expect((await pending).status).toBe(200);
    } finally {
      deps.sandboxRoot = sandbox;
    }
  });
});

describe("template bridge route", () => {
  const validSeed = {
    preset: "auth",
    database: "sqlite",
    packageManager: "npm",
    usePrisma: true,
  };

  it("refuses to replace the sandbox without explicit confirmation", async () => {
    const res = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, confirm: false }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("replaces the entire sandbox");
  });

  it("keeps the CLI's fullstack matrix honest", async () => {
    const res = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, preset: "fullstack", frontend: "react", database: "sqlite", confirm: true }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("requires PostgreSQL");

    const needsFrontend = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, preset: "fullstack", database: "postgresql", confirm: true }),
    });
    expect(needsFrontend.status).toBe(422);
    expect((await needsFrontend.json()).error).toContain("needs a frontend");

    const strayFrontend = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, frontend: "react", confirm: true }),
    });
    expect(strayFrontend.status).toBe(422);
    expect((await strayFrontend.json()).error).toContain("fullstack preset");
  });

  it("refuses while a run is active", async () => {
    fakeRunnerRunning = true;
    const res = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, confirm: true }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("running");
  });

  it("seeds through the bridge CLI and resets the chat context", async () => {
    // Prior sandbox state and a prior conversation turn must not survive.
    await writeFile(path.join(sandbox, "old-life.txt"), "junk", "utf8");
    const prior = await chat("build something for the old sandbox");
    await prior.text();

    const clone = await mkdtemp(path.join(tmpdir(), "a8-route-clone-"));
    try {
      await mkdir(path.join(clone, "dist"), { recursive: true });
      await writeFile(
        path.join(clone, "package.json"),
        JSON.stringify({ name: "create-authenik8-app", bin: { "create-authenik8-app": "dist/cli.js" } }),
        "utf8",
      );
      await writeFile(
        path.join(clone, "dist", "cli.js"),
        `import { mkdirSync, writeFileSync } from "node:fs";
const name = process.argv[2];
console.log("stub: generating", name);
mkdirSync(name, { recursive: true });
writeFileSync(name + "/authenik8.json", JSON.stringify({ schemaVersion: 1 }));
writeFileSync(name + "/package.json", JSON.stringify({ scripts: { start: "node server.js" } }));
writeFileSync(name + "/stub-argv.json", JSON.stringify(process.argv));
process.exit(0);
`,
        "utf8",
      );
      deps.bridge = { kind: "package", binPath: path.join(clone, "dist", "cli.js") };

      const res = await fetch(`${base}/api/template`, {
        method: "POST",
        body: JSON.stringify({ ...validSeed, confirm: true }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain('"phase":"start"');
      expect(text).toContain("[out] stub: generating");
      expect(text).toContain('"phase":"seeded"');
      expect(text).toContain('"done":true');

      const names = await readdir(sandbox);
      expect(names).toContain("authenik8.json");
      expect(names).toContain("package.json");
      expect(names).not.toContain("old-life.txt");

      // The studio's argv contract reached the CLI untouched.
      const argv = JSON.parse(await readFile(path.join(sandbox, "stub-argv.json"), "utf8")) as string[];
      for (const guard of ["--no-git", "--no-install", "--yes"]) {
        expect(argv).toContain(guard);
      }
      await rm(path.join(sandbox, "stub-argv.json"), { force: true });

      // The conversation reset: the next model request carries a fresh runtime
      // context plus the user turn.
      script = [textRound];
      const afterSeed = await chat("fresh start");
      await afterSeed.text();
      expect(capturedRequests.at(-1)!.messages).toHaveLength(3);
    } finally {
      delete deps.bridge;
    }
  });
});

describe("export route", () => {
  it("downloads the sandbox as a ZIP, skipping node_modules and dotfiles", async () => {
    await executeTool("write_file", JSON.stringify({ path: "index.html", content: "<h1>ship it</h1>" }), sandbox);
    await executeTool("write_file", JSON.stringify({ path: ".env", content: "SECRET=1" }), sandbox);

    const res = await fetch(`${base}/api/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4).toString("hex")).toBe("504b0304"); // ZIP local header
    expect(body.toString("latin1")).toContain("index.html");
    expect(body.toString("latin1")).not.toContain(".env");
  });

  it("bootstraps a missing sandbox and exports a valid empty ZIP on first run", async () => {
    // A first-run dev can click Export ZIP before anything was ever
    // generated: the sandbox does not exist yet. The export must not 500.
    const fresh = path.join(sandbox, "bootstrap-export");
    deps.sandboxRoot = fresh;
    try {
      const res = await fetch(`${base}/api/export`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");

      const body = Buffer.from(await res.arrayBuffer());
      expect(existsSync(fresh)).toBe(true); // sandbox was bootstrapped, not zip-crashed
      const eocd = body.subarray(body.length - 22);
      expect(eocd.subarray(0, 4).toString("hex")).toBe("504b0506"); // end of central directory
      expect(eocd.readUInt16LE(10)).toBe(0); // zero entries
      expect(eocd.readUInt16LE(12)).toBe(0);
    } finally {
      deps.sandboxRoot = sandbox;
      await rm(fresh, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe("run routes", () => {
  beforeEach(async () => {
    // A runnable sandbox: npm must resolve scripts.start INSIDE the sandbox.
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { start: "node server.js" } }),
      "utf8",
    );
  });

  it("streams runner events and output over SSE", async () => {
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(fakeRunnerStarted).toBe(1);
    expect(runnerHandlers).not.toBeNull();

    // Emit a full run lifecycle, then drain: the terminal event ends the stream.
    runnerHandlers!.onEvent({ phase: "install", code: null });
    runnerHandlers!.onOutput("added 512 packages");
    runnerHandlers!.onEvent({ phase: "serve", code: null });
    runnerHandlers!.onEvent({ phase: "exited", code: 0 });

    const text = await res.text();
    expect(text).toContain('"phase":"install"');
    expect(text).toContain("added 512 packages");
    expect(text).toContain('"phase":"serve"');
    expect(text).toContain('"phase":"exited"');
  });

  it("composes a build step for manifests whose start entry is compiled and missing", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { build: "tsc", start: "node dist/server.js" } }),
      "utf8",
    );
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    runnerHandlers!.onEvent({ phase: "exited", code: 0 }); // end the stream
    await res.text(); // drain the SSE stream
    expect(fakeRunnerCommands).not.toBeNull();
    expect(fakeRunnerCommands!.steps.map((step) => step.phase)).toEqual(["install", "build", "serve"]);
    expect(fakeRunnerCommands!.steps[1]!.argv.slice(-2)).toEqual(["run", "build"]);
  });

  it("skips the build step once the compiled entry exists", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { build: "tsc", start: "node dist/server.js" } }),
      "utf8",
    );
    await mkdir(path.join(sandbox, "dist"), { recursive: true });
    await writeFile(path.join(sandbox, "dist", "server.js"), "", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    runnerHandlers!.onEvent({ phase: "exited", code: 0 }); // end the stream
    await res.text(); // drain the SSE stream
    expect(fakeRunnerCommands!.steps.map((step) => step.phase)).toEqual(["install", "serve"]);
  });

  it("fails closed when the sandbox has nothing runnable (npm would walk up out of the sandbox)", async () => {
    await rm(path.join(sandbox, "package.json"), { force: true });
    await rm(path.join(sandbox, "index.html"), { force: true });
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("Nothing to run yet");
    expect(fakeRunnerStarted).toBe(0);
  });

  it("auto-bootstraps a static sandbox in place and runs it â€” no model call needed", async () => {
    // A chat-generated static app from before the package.json contract.
    await rm(path.join(sandbox, "package.json"), { force: true });
    await rm(path.join(sandbox, "server.js"), { force: true });
    await writeFile(path.join(sandbox, "index.html"), "<h1>static app</h1>", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(fakeRunnerStarted).toBe(1);

    // The manifests landed on disk, not just in memory.
    const manifest = JSON.parse(await readFile(path.join(sandbox, "package.json"), "utf8")) as {
      scripts?: { start?: string };
    };
    expect(manifest.scripts?.start).toBe("node server.js");
    const serverJs = await readFile(path.join(sandbox, "server.js"), "utf8");
    expect(serverJs).toContain("node:http");
    // A custom server.js is never clobbered:
    await writeFile(path.join(sandbox, "server.js"), "// custom", "utf8");
    await rm(path.join(sandbox, "package.json"), { force: true });
    await writeFile(path.join(sandbox, "index.html"), "<h1>static app 2</h1>", "utf8");

    // Drain the first stream, then re-run to verify the clobber-free path.
    runnerHandlers!.onEvent({ phase: "serve", code: null });
    runnerHandlers!.onEvent({ phase: "exited", code: 0 });
    const first = await res.text();
    expect(first).toContain("bootstrapped");
    expect(first).toContain("wrote a zero-dependency server.js");

    const second = await fetch(`${base}/api/run`, { method: "POST" });
    expect(second.status).toBe(200);
    expect(fakeRunnerStarted).toBe(2);
    // custom server.js survived the bootstrap.
    expect(await readFile(path.join(sandbox, "server.js"), "utf8")).toBe("// custom");
    runnerHandlers!.onEvent({ phase: "exited", code: 0 });
    const secondText = await second.text();
    expect(secondText).toContain("added package.json with a start script");
    expect(secondText).not.toContain("wrote a zero-dependency server.js");
  });

  it("fails closed when package.json has no start script", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "sandbox-app", scripts: { dev: "vite" } }),
      "utf8",
    );
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("start");
    expect(fakeRunnerStarted).toBe(0);
  });

  it("fails closed on an unparseable package.json", async () => {
    await writeFile(path.join(sandbox, "package.json"), "{ not json", "utf8");
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("valid JSON");
    expect(fakeRunnerStarted).toBe(0);
  });

  it("writes the missing entry file scripts.start references instead of skipping run", async () => {
    // Observed live: the model promised "node server.js" but never wrote it.
    await rm(path.join(sandbox, "server.js"), { force: true });
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "pomodoro-timer", scripts: { start: "node server.js" } }),
      "utf8",
    );
    await writeFile(path.join(sandbox, "index.html"), "<h1>timer</h1>", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(fakeRunnerStarted).toBe(1);

    const serverJs = await readFile(path.join(sandbox, "server.js"), "utf8");
    expect(serverJs).toContain("node:http");

    runnerHandlers!.onEvent({ phase: "serve", code: null });
    runnerHandlers!.onEvent({ phase: "exited", code: 0 });
    const text = await res.text();
    expect(text).toContain("because scripts.start referenced it");
  });

  it("never rewrites a start command it cannot implement (non-node scripts pass through)", async () => {
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "vite dev --port 5173" } }),
      "utf8",
    );
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200); // the project's own commands remain the project's
    expect(fakeRunnerStarted).toBe(1);
  });

  it("refreshes a stale studio-owned entry file to the current template", async () => {
    // A sandbox provisioned by an earlier studio version keeps running with
    // the old template unless the studio owns and refreshes its own files.
    await writeFile(
      path.join(sandbox, "server.js"),
      "// Written by Authenik8 Studio Web: minimal zero-dependency static server.\nconst http = require('node:http');\nhttp.createServer(() => {}).listen(3000);\n",
      "utf8",
    );
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "node server.js" } }),
      "utf8",
    );
    await writeFile(path.join(sandbox, "index.html"), "<h1>app</h1>", "utf8");

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(fakeRunnerStarted).toBe(1);
    const serverJs = await readFile(path.join(sandbox, "server.js"), "utf8");
    expect(serverJs).toContain("EADDRINUSE"); // the resilient-port template

    runnerHandlers!.onEvent({ phase: "serve", code: null });
    runnerHandlers!.onEvent({ phase: "exited", code: 0 });
    const text = await res.text();
    expect(text).toContain("refreshed server.js");
  });

  it("never touches a model-written entry file that shares the name", async () => {
    const custom = "console.log('the model wrote me');\n";
    await writeFile(path.join(sandbox, "server.js"), custom, "utf8");
    await writeFile(
      path.join(sandbox, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "node server.js" } }),
      "utf8",
    );

    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(fakeRunnerStarted).toBe(1);
    expect(await readFile(path.join(sandbox, "server.js"), "utf8")).toBe(custom);
  });

  it("409s a second run while the project is already running", async () => {
    fakeRunnerRunning = true;
    const res = await fetch(`${base}/api/run`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(fakeRunnerStarted).toBe(0);

    const status = await fetch(`${base}/api/run/status`);
    expect(await status.json()).toEqual({ running: true });
  });

  it("stops the project through the runner", async () => {
    const res = await fetch(`${base}/api/run/stop`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(fakeRunnerStopped).toBe(1);
  });
});

describe("startStudio port discipline", () => {
  it("falls back to the next free port when the preferred one is busy", async () => {
    // Something else already owns a port (the first-run dev's classic bind collision).
    const occupant = createNetServer();
    await new Promise<void>((resolve) => occupant.listen(0, "127.0.0.1", resolve));
    const busyPort = (occupant.address() as AddressInfo).port;

    const started = startStudio({ port: busyPort });
    // The busy port is skipped: the server ends up answering on the next one.
    await vi.waitFor(() => {
      const final = started.address() as AddressInfo | null;
      expect(final !== null && final.port > busyPort).toBe(true);
    });
    const finalPort = (started.address() as AddressInfo).port;
    expect(finalPort).toBe(busyPort + 1);

    await new Promise<void>((resolve) => started.close(resolve));
    await new Promise<void>((resolve) => occupant.close(resolve));
  });
});
