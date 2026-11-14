import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChatChunk, ChatRequest } from "@authenik8/models";

import {
  BUILDER_MAX_DIRECTORY_CHARS,
  READ_ONLY_TOOL_NAMES,
  SUBAGENT_DIR,
  SUBAGENT_MAX_REPORT_CHARS,
  SUBAGENT_MAX_TASK_CHARS,
  buildTaskSchema,
  buildToolDefinition,
  exploreTaskSchema,
  exploreToolDefinition,
  reviewTaskSchema,
  reviewToolDefinition,
  runBuilder,
  runExplorer,
  runReviewer,
} from "../src/subagent.js";
import { createLeaseManager } from "../src/directory-lease.js";
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

describe("reviewTaskSchema", () => {
  it("shares the explorer task bounds", () => {
    expect(reviewTaskSchema.parse({ task: "  review auth  " }).task).toBe("review auth");
    expect(reviewTaskSchema.safeParse({ task: "" }).success).toBe(false);
    expect(reviewTaskSchema.safeParse({ task: "   " }).success).toBe(false);
  });
});

describe("buildTaskSchema", () => {
  it("trims and bounds the task and directory", () => {
    expect(buildTaskSchema.parse({ directory: "  src  ", task: "  build it  " })).toEqual({
      directory: "src",
      task: "build it",
    });
    expect(buildTaskSchema.safeParse({ directory: "", task: "build" }).success).toBe(false);
    expect(buildTaskSchema.safeParse({ directory: "src", task: "   " }).success).toBe(false);
    expect(
      buildTaskSchema.safeParse({
        directory: "x".repeat(BUILDER_MAX_DIRECTORY_CHARS + 1),
        task: "build",
      }).success,
    ).toBe(false);
  });
});

describe("child tool definitions", () => {
  it("offers explorer, reviewer, and builder with a shared one-per-turn limit", () => {
    expect(exploreToolDefinition.name).toBe("explore_project");
    expect(reviewToolDefinition.name).toBe("review_project");
    expect(buildToolDefinition.name).toBe("build_project");
    expect(exploreToolDefinition.description).toContain("at most one child");
    expect(reviewToolDefinition.description).toContain("at most one child");
    expect(buildToolDefinition.description).toContain("at most one child");
    expect(reviewToolDefinition.description).toContain("findings ordered by severity");
    expect(buildToolDefinition.description).toContain("write only inside the leased directory");
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

describe("runReviewer", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "authenik8-reviewer-"));
    await writeFile(path.join(sandbox, "README.md"), "# Demo\nHello from README.\n", "utf8");
    await writeFile(path.join(sandbox, ".env"), "REVIEWER_SECRET=do-not-read\n", "utf8");
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("runs a fresh reviewer child and returns findings", async () => {
    const { gateway, requests } = scriptedGateway([
      toolRound([{ id: "read_1", name: "read_file", args: { path: "README.md" } }]),
      textRound("High: README has no setup steps. Evidence: README.md."),
    ]);
    const outcome = await runReviewer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Review README.md for missing setup steps.",
      signal: new AbortController().signal,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.rounds).toBe(2);
    expect(outcome.result).toContain("Reviewer report (read-only, 2 rounds):");
    expect(outcome.result).toContain("High: README has no setup steps.");
    expect(outcome.result).toContain(`Child: ${outcome.childId}`);

    expect(requests).toHaveLength(2);
    expect(requests[0]!.messages).toHaveLength(2);
    expect(requests[0]!.messages[0]?.role).toBe("system");
    expect(requests[0]!.messages[0]?.content).toContain("read-only reviewer");
    expect(requests[0]!.messages[0]?.content).toContain("findings ordered by severity");
    expect(requests[0]!.messages[1]).toEqual({
      role: "user",
      content: "Review README.md for missing setup steps.",
    });
    expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "design_audit",
    ]);
    expect(requests[0]!.tools?.some((tool) => tool.name === "write_file")).toBe(false);
    expect(requests[0]!.tools?.some((tool) => tool.name === "review_project")).toBe(false);

    const logPath = path.join(
      sandbox,
      SESSION_DIR,
      SUBAGENT_DIR,
      `review-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    expect(
      history.some(
        (message) => message.role === "tool" && message.content.includes("Hello from README."),
      ),
    ).toBe(true);
    expect(history.some((message) => message.content.includes("REVIEWER_SECRET"))).toBe(false);
  });

  it("rejects writes, delegation, and environment reads", async () => {
    const { gateway, requests } = scriptedGateway([
      toolRound([
        { id: "write_1", name: "write_file", args: { path: "new.txt", content: "nope" } },
        { id: "delegate_1", name: "review_project", args: { task: "go deeper" } },
        { id: "env_1", name: "read_file", args: { path: ".env" } },
      ]),
      textRound("No findings. I could not write, delegate, or read secrets."),
    ]);
    const outcome = await runReviewer({
      gateway,
      model: "free/model-a",
      sandboxRoot: sandbox,
      task: "Try to write a file, delegate, and read .env.",
      signal: new AbortController().signal,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain("No findings.");
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
      `review-${outcome.childId}.jsonl`,
    );
    const history = await new SessionLog(logPath).history();
    const toolText = history
      .filter((message) => message.role === "tool")
      .map((message) => message.content)
      .join("\n");
    expect(toolText).toContain("the reviewer is read-only and cannot use write_file");
    expect(toolText).toContain("cannot use review_project");
    expect(toolText).toContain("the reviewer cannot read environment files");
    expect(toolText).not.toContain("do-not-read");
  });
});

describe("runBuilder", () => {
  let sandbox: string;
  let leases: ReturnType<typeof createLeaseManager>;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "authenik8-builder-"));
    await writeFile(path.join(sandbox, "README.md"), "Hello from README.\n", "utf8");
    await writeFile(path.join(sandbox, ".env"), "BUILDER_SECRET=do-not-read\n", "utf8");
    leases = createLeaseManager();
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("writes inside the lease and reports the files", async () => {
    const acquired = leases.acquire(sandbox, "src");
    if (!acquired.ok) throw new Error(acquired.error);
    const { gateway, requests } = scriptedGateway([
      toolRound([
        {
          id: "write_1",
          name: "write_file",
          args: { path: "src/hello.ts", content: "export const hello = 1;\n" },
        },
      ]),
      textRound("Created src/hello.ts."),
    ]);
    try {
      const outcome = await runBuilder({
        gateway,
        model: "free/model-a",
        sandboxRoot: sandbox,
        task: "Create src/hello.ts.",
        signal: new AbortController().signal,
        lease: acquired.lease,
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.rounds).toBe(2);
      expect(outcome.result).toContain("Builder report (write, 2 rounds):");
      expect(outcome.result).toContain("Created src/hello.ts.");
      expect(outcome.result).toContain("Files written: src/hello.ts");
      expect(outcome.result).toContain(`Child: ${outcome.childId}`);

      expect(requests).toHaveLength(2);
      expect(requests[0]!.messages).toHaveLength(2);
      expect(requests[0]!.messages[0]?.content).toContain("write-capable builder");
      expect(requests[0]!.messages[0]?.content).toContain('leased directory "src"');
      expect(requests[0]!.messages[0]?.content).toContain("Never write .env");
      expect(requests[0]!.tools?.map((tool) => tool.name)).toEqual([
        "list_files",
        "read_file",
        "write_file",
        "design_audit",
      ]);

      expect(await readFile(path.join(sandbox, "src", "hello.ts"), "utf8")).toBe(
        "export const hello = 1;\n",
      );
      const logPath = path.join(
        sandbox,
        SESSION_DIR,
        SUBAGENT_DIR,
        `build-${outcome.childId}.jsonl`,
      );
      const raw = await readFile(logPath, "utf8");
      expect(raw).toContain("export const hello = 1;");
      expect(raw).not.toContain("BUILDER_SECRET");
    } finally {
      leases.release(acquired.lease);
    }
  });

  it("rejects writes outside the lease and sensitive paths", async () => {
    const acquired = leases.acquire(sandbox, "src");
    if (!acquired.ok) throw new Error(acquired.error);
    const { gateway } = scriptedGateway([
      toolRound([
        { id: "outside_1", name: "write_file", args: { path: "README.md", content: "overwritten" } },
        { id: "env_1", name: "write_file", args: { path: "src/.env", content: "SECRET=1" } },
        { id: "git_1", name: "write_file", args: { path: "src/.git/config", content: "nope" } },
        {
          id: "write_1",
          name: "write_file",
          args: { path: "src/hello.ts", content: "export const hello = 1;\n" },
        },
      ]),
      textRound("Wrote only src/hello.ts."),
    ]);
    try {
      const outcome = await runBuilder({
        gateway,
        model: "free/model-a",
        sandboxRoot: sandbox,
        task: "Try unsafe writes, then write src/hello.ts.",
        signal: new AbortController().signal,
        lease: acquired.lease,
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.result).toContain("Files written: src/hello.ts");
      expect(outcome.result).not.toContain("Files written: README.md");
      expect(await readFile(path.join(sandbox, "README.md"), "utf8")).toBe(
        "Hello from README.\n",
      );
      await expect(readFile(path.join(sandbox, "src", ".env"), "utf8")).rejects.toThrow();
      await expect(
        readFile(path.join(sandbox, "src", ".git", "config"), "utf8"),
      ).rejects.toThrow();
      expect(await readFile(path.join(sandbox, "src", "hello.ts"), "utf8")).toBe(
        "export const hello = 1;\n",
      );

      const logPath = path.join(
        sandbox,
        SESSION_DIR,
        SUBAGENT_DIR,
        `build-${outcome.childId}.jsonl`,
      );
      const history = await new SessionLog(logPath).history();
      const toolText = history
        .filter((message) => message.role === "tool")
        .map((message) => message.content)
        .join("\n");
      expect(toolText).toContain("can write only inside src");
      expect(toolText).toContain("cannot write .env files");
      expect(toolText).toContain("cannot write to .git paths");
      expect(toolText).not.toContain("BUILDER_SECRET");
    } finally {
      leases.release(acquired.lease);
    }
  });

  it("allows a dot-prefixed directory inside the lease", async () => {
    const acquired = leases.acquire(sandbox, "src");
    if (!acquired.ok) throw new Error(acquired.error);
    const { gateway } = scriptedGateway([
      toolRound([
        {
          id: "write_1",
          name: "write_file",
          args: { path: "src/..data/hello.ts", content: "export const dotdot = 1;\n" },
        },
      ]),
      textRound("Created src/..data/hello.ts."),
    ]);
    try {
      const outcome = await runBuilder({
        gateway,
        model: "free/model-a",
        sandboxRoot: sandbox,
        task: "Create src/..data/hello.ts.",
        signal: new AbortController().signal,
        lease: acquired.lease,
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.result).toContain("Files written: src/..data/hello.ts");
      expect(
        await readFile(path.join(sandbox, "src", "..data", "hello.ts"), "utf8"),
      ).toBe("export const dotdot = 1;\n");
    } finally {
      leases.release(acquired.lease);
    }
  });

  it("rejects tools outside the builder allowlist", async () => {
    const acquired = leases.acquire(sandbox, "src");
    if (!acquired.ok) throw new Error(acquired.error);
    const { gateway } = scriptedGateway([
      toolRound([
        {
          id: "plan_1",
          name: "update_plan",
          args: { steps: [{ title: "x", status: "pending" }] },
        },
        { id: "delegate_1", name: "explore_project", args: { task: "look" } },
      ]),
      textRound("No changes."),
    ]);
    try {
      const outcome = await runBuilder({
        gateway,
        model: "free/model-a",
        sandboxRoot: sandbox,
        task: "Try disallowed tools.",
        signal: new AbortController().signal,
        lease: acquired.lease,
      });

      expect(outcome.ok).toBe(true);
      expect(outcome.result).toContain("Files written: none");
      const logPath = path.join(
        sandbox,
        SESSION_DIR,
        SUBAGENT_DIR,
        `build-${outcome.childId}.jsonl`,
      );
      const history = await new SessionLog(logPath).history();
      const toolText = history
        .filter((message) => message.role === "tool")
        .map((message) => message.content)
        .join("\n");
      expect(toolText).toContain("the builder cannot use update_plan");
      expect(toolText).toContain("the builder cannot use explore_project");
    } finally {
      leases.release(acquired.lease);
    }
  });
});
