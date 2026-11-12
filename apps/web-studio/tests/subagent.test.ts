import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatChunk, ChatRequest } from "@authenik8/models";

import {
  READ_ONLY_TOOL_NAMES,
  SUBAGENT_DIR,
  SUBAGENT_MAX_REPORT_CHARS,
  SUBAGENT_MAX_TASK_CHARS,
  exploreTaskSchema,
  runExplorer,
} from "../src/subagent.js";
import { SESSION_DIR, SessionLog } from "../src/session-log.js";

type ScriptEntry = ChatChunk[] | { throw: string };

function toolRound(calls: Array<{ id: string; name: string; args: unknown }>): ChatChunk[] {
  return [
    {
      delta: null,
      toolCalls: calls.map((call, index) => ({
        index,
        id: call.id,
        name: call.name,
        argumentsDelta: JSON.stringify(call.args),
      })),
      finishReason: null,
      usage: null,
    },
    { delta: null, toolCalls: null, finishReason: "tool_calls", usage: null },
  ];
}

function textRound(text: string): ChatChunk[] {
  return [
    { delta: text, toolCalls: null, finishReason: null, usage: null },
    { delta: null, toolCalls: null, finishReason: "stop", usage: null },
  ];
}

function scriptedGateway(script: ScriptEntry[]): {
  gateway: { chatStream(request: ChatRequest): AsyncIterable<ChatChunk> };
  requests: ChatRequest[];
} {
  const requests: ChatRequest[] = [];
  let index = 0;
  return {
    requests,
    gateway: {
      chatStream(request) {
        requests.push(request);
        const entry = script[Math.min(index, script.length - 1)]!;
        index++;
        if ("throw" in entry) {
          return (async function* () {
            throw new Error(entry.throw);
          })();
        }
        return (async function* () {
          for (const chunk of entry) yield chunk;
        })();
      },
    },
  };
}

describe("exploreTaskSchema", () => {
  it("trims and bounds the task", () => {
    expect(exploreTaskSchema.parse({ task: "  inspect the design  " }).task).toBe(
      "inspect the design",
    );
    expect(exploreTaskSchema.safeParse({ task: "" }).success).toBe(false);
    expect(exploreTaskSchema.safeParse({ task: "   " }).success).toBe(false);
    expect(
      exploreTaskSchema.safeParse({ task: "x".repeat(SUBAGENT_MAX_TASK_CHARS) }).success,
    ).toBe(true);
    expect(
      exploreTaskSchema.safeParse({ task: "x".repeat(SUBAGENT_MAX_TASK_CHARS + 1) }).success,
    ).toBe(false);
  });
});

describe("runExplorer", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "authenik8-explorer-"));
    await writeFile(path.join(sandbox, "README.md"), "# Demo\nHello from README.\n", "utf8");
    await writeFile(path.join(sandbox, ".env"), "EXPLORER_SECRET=do-not-read\n", "utf8");
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("runs a fresh read-only child and keeps its transcript out of the parent", async () => {
    const { gateway, requests } = scriptedGateway([
      toolRound([{ id: "read_1", name: "read_file", args: { path: "README.md" } }]),
      textRound("Answer: the project has a README. Evidence: README.md."),
    ]);
    const outcome = await runExplorer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Read README.md and report what the project is.",
      signal: new AbortController().signal,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.rounds).toBe(2);
    expect(outcome.result).toContain("Explorer report (read-only, 2 rounds):");
    expect(outcome.result).toContain("Answer: the project has a README.");
    expect(outcome.result).toContain(`Child: ${outcome.childId}`);

    expect(requests).toHaveLength(2);
    expect(requests[0]!.messages).toHaveLength(2);
    expect(requests[0]!.messages[0]?.role).toBe("system");
    expect(requests[0]!.messages[0]?.content).toContain("read-only explorer");
    expect(requests[0]!.messages[1]).toEqual({
      role: "user",
      content: "Read README.md and report what the project is.",
    });
    expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "design_audit",
    ]);
    expect(requests[0]!.tools?.some((tool) => tool.name === "write_file")).toBe(false);
    expect(requests[0]!.tools?.some((tool) => tool.name === "explore_project")).toBe(false);
    expect(READ_ONLY_TOOL_NAMES.has("write_file")).toBe(false);

    const logPath = path.join(
      sandbox,
      SESSION_DIR,
      SUBAGENT_DIR,
      `explore-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    expect(
      history.some((message) => message.role === "user" && message.content.includes("README")),
    ).toBe(true);
    expect(
      history.some(
        (message) => message.role === "tool" && message.content.includes("Hello from README."),
      ),
    ).toBe(true);
    expect(
      history.some((message) => message.role === "assistant" && message.content.includes("Answer:")),
    ).toBe(true);
    expect(history.some((message) => message.content.includes("EXPLORER_SECRET"))).toBe(false);
  });

  it("rejects writes, delegation, and environment reads", async () => {
    const { gateway, requests } = scriptedGateway([
      toolRound([
        { id: "write_1", name: "write_file", args: { path: "new.txt", content: "nope" } },
        { id: "delegate_1", name: "explore_project", args: { task: "go deeper" } },
        { id: "env_1", name: "read_file", args: { path: ".env" } },
      ]),
      textRound("Answer: I could not write, delegate, or read secrets."),
    ]);
    const outcome = await runExplorer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Try to write a file, delegate, and read .env.",
      signal: new AbortController().signal,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain("I could not write, delegate, or read secrets.");
    expect(outcome.result).not.toContain("do-not-read");

    await expect(readFile(path.join(sandbox, "new.txt"), "utf8")).rejects.toThrow();
    expect(requests).toHaveLength(2);
    expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "design_audit",
    ]);

    const logPath = path.join(
      sandbox,
      SESSION_DIR,
      SUBAGENT_DIR,
      `explore-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    const toolText = history
      .filter((message) => message.role === "tool")
      .map((message) => message.content)
      .join("\n");
    expect(toolText).toContain("cannot use write_file");
    expect(toolText).toContain("cannot use explore_project");
    expect(toolText).toContain("cannot read environment files");
    expect(toolText).not.toContain("do-not-read");
  });

  it("caps the parent-visible report while the child log keeps the full text", async () => {
    const long = `Answer: ${"x".repeat(SUBAGENT_MAX_REPORT_CHARS + 500)}`;
    const { gateway } = scriptedGateway([textRound(long)]);
    const outcome = await runExplorer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Return a long report.",
      signal: new AbortController().signal,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain("...[truncated]");
    expect(outcome.result.length).toBeLessThan(SUBAGENT_MAX_REPORT_CHARS + 300);

    const logPath = path.join(
      sandbox,
      SESSION_DIR,
      SUBAGENT_DIR,
      `explore-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    const assistant = history.find((message) => message.role === "assistant");
    expect(assistant?.content.length).toBe(long.length);
  });

  it("stops at the tool round budget", async () => {
    const rounds = Array.from({ length: 4 }, (_, index) =>
      toolRound([{ id: `read_${index}`, name: "read_file", args: { path: "README.md" } }]),
    );
    const { gateway, requests } = scriptedGateway(rounds);
    const outcome = await runExplorer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Keep reading.",
      signal: new AbortController().signal,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain("tool round budget (4)");
    expect(outcome.rounds).toBe(4);
    expect(requests).toHaveLength(4);

    const logPath = path.join(
      sandbox,
      SESSION_DIR,
      SUBAGENT_DIR,
      `explore-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    expect(history.filter((message) => message.role === "assistant")).toHaveLength(4);
    expect(history.filter((message) => message.role === "tool")).toHaveLength(4);
  });

  it("cancels when the parent signal is already aborted", async () => {
    const { gateway, requests } = scriptedGateway([textRound("never")]);
    const controller = new AbortController();
    controller.abort();
    const outcome = await runExplorer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Never start.",
      signal: controller.signal,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain("cancelled");
    expect(requests).toHaveLength(0);

    const logPath = path.join(
      sandbox,
      SESSION_DIR,
      SUBAGENT_DIR,
      `explore-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    expect(history.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("times out a hung model call", async () => {
    const gateway = {
      chatStream(request: ChatRequest): AsyncIterable<ChatChunk> {
        return (async function* () {
          await new Promise<never>((_, reject) => {
            request.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          });
        })();
      },
    };
    const outcome = await runExplorer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Hang.",
      signal: new AbortController().signal,
      timeoutMs: 20,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain("timed out");
  });
});
