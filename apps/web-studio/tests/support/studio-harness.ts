import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach } from "vitest";

import type { AgentRunResult, AgentRuntime, AgentStreamEvent } from "@authenik8/agent-adapter";
import type { ChatChunk, ChatRequest } from "@authenik8/models";

import { createWebStudioServer, type WebStudioDeps } from "../../src/server.js";
import type { Runner, RunnerCommands, RunnerHandlers } from "../../src/runner.js";

export const KEY = "sk-or-test-key-must-never-leak";

export const fakeModels = [
  { id: "free/model-a", name: "Model A", contextLength: 128_000, inputModalities: ["text"], supportsTools: true, isFree: true, pricing: null },
  { id: "paid/model", name: "Paid", contextLength: 200_000, inputModalities: ["text"], supportsTools: true, isFree: false, pricing: { prompt: 0.001, completion: 0.002 } },
  { id: "free/no-tools", name: "No Tools", contextLength: 8_000, inputModalities: ["text"], supportsTools: false, isFree: true, pricing: null },
  { id: "openrouter/free", name: "Free auto-router", contextLength: 200_000, inputModalities: ["text"], supportsTools: true, isFree: true, pricing: null },
];

// Scripted rounds: each chatStream call consumes the next entry; the last
// entry repeats when the loop runs longer than the script. A `{ throw }`
// entry makes the stream fail with that error (provider-level refusal).
export type ScriptEntry = ChatChunk[] | { throw: string };

/** Mutable per-test model script and cursor. */
export const state = {
  script: [] as ScriptEntry[],
  roundIndex: 0,
};

export let capturedRequests: ChatRequest[] = [];

export const fakeGateway = {
  listModels: async () => fakeModels,
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
    capturedRequests.push(request);
    const entry = state.script[Math.min(state.roundIndex, state.script.length - 1)]!;
    state.roundIndex++;
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

export const textRound: ChatChunk[] = [
  { delta: "Done.", toolCalls: null, finishReason: null, usage: null },
  {
    delta: null,
    toolCalls: null,
    finishReason: "stop",
    usage: { promptTokens: 40, completionTokens: 5, totalTokens: 45, costUsd: null },
  },
];

export function sseToolChildId(text: string, name: string): string | undefined {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = JSON.parse(line.slice(6)) as {
      tool?: { name?: string; phase?: string; childId?: string };
    };
    if (payload.tool?.name === name && payload.tool.phase === "done") return payload.tool.childId;
  }
  return undefined;
}

export let sandbox = "";
export let capturedKey: string | null = null;

// Agent fake: captures the request, waits for the test to resolve the run.
let resolveRunInternal: ((result: AgentRunResult) => void) | null = null;

/** Resolve the pending fake agent run. */
export function resolveRun(result: AgentRunResult): void {
  resolveRunInternal?.(result);
}

export const agentCalls: Array<{
  prompt: string;
  cwd?: string;
  autoApprove?: boolean;
  onEvent?: ((event: AgentStreamEvent) => void) | undefined;
}> = [];

export const fakeRuntime: AgentRuntime = {
  id: "opencode",
  run(request) {
    agentCalls.push({
      prompt: request.prompt,
      cwd: request.cwd,
      autoApprove: request.autoApprove,
      onEvent: request.onEvent,
    });
    return new Promise<AgentRunResult>((resolve) => {
      resolveRunInternal = resolve;
    });
  },
};

export const agentSuccess: AgentRunResult = {
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
export const runnerState = {
  running: false,
  started: 0,
  stopped: 0,
  commands: null as RunnerCommands,
};

let runnerHandlersInternal: RunnerHandlers | null = null;

/** Handlers captured when the server built its runner. */
export function getRunnerHandlers(): RunnerHandlers | null {
  return runnerHandlersInternal;
}

export const fakeRunner: Runner = {
  start: (_cwd, commands) => {
    runnerState.started++;
    runnerState.commands = commands;
    return true;
  },
  stop: () => {
    runnerState.stopped++;
  },
  isRunning: () => runnerState.running,
};

const fakeCreateRunner = (handlers: RunnerHandlers): Runner => {
  runnerHandlersInternal = handlers;
  return fakeRunner;
};

export const deps: WebStudioDeps = {
  gatewayFor: (apiKey) => {
    capturedKey = apiKey;
    return fakeGateway;
  },
  publicModels: async () => fakeModels,
  sandboxRoot: "", // filled in beforeAll
  maxToolRounds: 3,
  agentRuntime: fakeRuntime,
  createRunner: fakeCreateRunner,
};

const server = createWebStudioServer(deps);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
export let base = `http://127.0.0.1:${port}`;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "a8-studio-test-"));
  deps.sandboxRoot = sandbox;
});

beforeEach(() => {
  state.script = [];
  state.roundIndex = 0;
  capturedRequests = [];
  agentCalls.length = 0;
  resolveRunInternal = null;
  runnerState.running = false;
  runnerState.started = 0;
  runnerState.stopped = 0;
  runnerState.commands = null;
  // runnerHandlers stays: the server captured its handler closures once at
  // module load and they are stateless.
});

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await rm(sandbox, { recursive: true, force: true }).catch(() => {
    // Best effort: a failed temp cleanup must not fail the suite.
  });
});

export function chat(message: string, model = "free/model-a", mode?: string): Promise<Response> {
  return fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-OpenRouter-Key": KEY },
    body: JSON.stringify({ model, message, ...(mode !== undefined ? { mode } : {}) }),
  });
}
