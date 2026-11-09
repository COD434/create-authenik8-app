import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createServer as createNetServer } from "node:net";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRunResult, AgentRuntime } from "@authenik8/agent-adapter";
import type { ChatChunk, ChatRequest } from "@authenik8/models";

import { createWebStudioServer, startStudio, type WebStudioDeps } from "../src/server.js";
import { executeTool } from "../src/tools.js";
import type { Runner, RunnerEvent, RunnerHandlers } from "../src/runner.js";
import type { AgentStreamEvent } from "@authenik8/agent-adapter";

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

// Runner fake: controlled isRunning, captured handlers for event injection.
let fakeRunnerRunning = false;
let fakeRunnerStarted = 0;
let fakeRunnerStopped = 0;
let runnerHandlers: RunnerHandlers | null = null;

const fakeRunner: Runner = {
  start: () => {
    fakeRunnerStarted++;
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
