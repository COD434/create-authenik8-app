import { assembleToolCalls, type ModelsGateway, type ToolCallDelta } from "@authenik8/models";
import { CANON_BUILD_PROMPT } from "@authenik8/engineering-canon";
import { z } from "zod";

import {
  DEFAULT_CONTEXT_BUDGET_CHARS,
  compactForRequest,
  type CompactionResult,
} from "../compaction.js";
import type { LeaseManager } from "../directory-lease.js";
import { abortOnDisconnect, apiKeyFrom, parseJsonBody, readBody, sendJson, sseEvent } from "../http.js";
import { parsePlanArgs } from "../plan.js";
import { buildRuntimeContext } from "../runtime-context.js";
import type { Runner } from "../runner.js";
import { TOOL_OUTCOME_UNKNOWN, type SessionLog } from "../session-log.js";
import {
  BUILDER_MAX_DIRECTORY_CHARS,
  buildTaskSchema,
  buildToolDefinition,
  exploreTaskSchema,
  exploreToolDefinition,
  reviewTaskSchema,
  reviewToolDefinition,
  runBuilder,
  runExplorer,
  runReviewer,
  SUBAGENT_MAX_TASK_CHARS,
} from "../subagent.js";
import { ensureRuntimeContext, FALLBACK_MODEL, sessionLog, type RouteContext, type WebStudioDeps } from "../studio-types.js";
import { executeTool, toolDefinitions, type ToolOutcome } from "../tools.js";
import { executeToolBatch, planToolBatches } from "../tool-loop.js";

/** One assembled parent tool call, as returned by the models gateway. */
type ParentToolCall = ReturnType<typeof assembleToolCalls>[number];
type Gateway = Pick<ModelsGateway, "listModels" | "chatStream">;

const CHAT_MODES = ["think", "plan", "build", "debug"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

const chatBodySchema = z.object({
  model: z.string().min(1).max(120),
  message: z.string().min(1).max(32_000),
  mode: z.enum(CHAT_MODES).optional().default("build"),
});

/**
 * Mode preambles shape the model's behavior without changing the tool
 * contract. `think` reasons without tools; `plan` only updates the plan;
 * `build` (default) has full tool access; `debug` focuses on diagnosis.
 */
const MODE_PREAMBLES: Record<ChatMode, string> = {
  think:
    "Mode: THINK. Reason carefully about the request before acting. Do not call any tools. Explain your understanding, the options, trade-offs, and a recommended approach in clear prose. Ask a blocking question only if you cannot proceed without an answer.",
  plan:
    "Mode: PLAN. Produce a concrete build plan. Call update_plan once with 3 to 8 short, ordered steps, then briefly explain the plan. Do not write files or call build_project in this mode; the plan is the deliverable.",
  build:
    "Mode: BUILD. Implement the request with real, runnable files in small verifiable steps, using the full tool set.",
  debug:
    "Mode: DEBUG. Diagnose the problem before changing anything. Read the relevant files and error output, identify the root cause, then make the smallest fix and verify it. Prefer read_file and review_project first; explain what was wrong and what you changed.",
};

const FINAL_TOOL_BUDGET_INSTRUCTION =
  "Tool budget reached. Do not call tools. Summarize what you completed, what remains, and the next step. Do not claim work you did not do. Use plain punctuation, no em dashes.";

const SYSTEM_PROMPT = [
  "You are Authenik8, a senior product engineer for the Authenik8 ecosystem.",
  "Thesis: vibe-code the interface; keep identity on a backend the user owns.",
  "You have tools that operate on a sandbox project directory: list_files, read_file,",
  "write_file, design_audit (Authenik8 design checks A8-DS-001..004 over a design",
  "directory with tokens.json + DESIGN.md), update_plan, explore_project, review_project,",
  "and build_project. Independent read-only calls can be batched in one message and run",
  "together; writes, plans, and child delegation are barriers that run alone in order.",
  "Build real files in small, verifiable steps: list the project, write complete runnable",
  "files, and say what you did in one short line before each tool call. For a multi-file",
  "build, call update_plan once with 3 to 8 short steps, then update it when a step starts",
  "or finishes.",
  "For a focused read-only investigation that would flood this conversation with file",
  "output, call explore_project with a self-contained task. For a review after a build or",
  "before export, call review_project with the risks to check. For a multi-file build or a",
  "short implement-and-check loop, call build_project with a sandbox-relative directory.",
  "A child does not see this conversation and returns a report. Read-only children cannot",
  "write; the builder can write only inside its leased directory and cannot run commands.",
  "Use at most one child per turn and verify its findings before changing files. After",
  "writing or changing design tokens, run design_audit and fix every failed check before",
  "moving on.",
  "The user previews your work live: the sandbox's index.html is served at /preview/.",
  "AI is optional: never add an AI dependency just because the app uses Authenik8. When the user asks for AI, shape it around the end user's task and identify the provider, data sources, allowed actions, access scope, and operational cost that matter; ask only blocking questions. Include the AI setup in the build plan.",
  "Studio's OpenRouter key is only for this build conversation. Never copy it to generated files. App model calls run server-side with the app owner's separately configured credentials, loaded from environment variables; write only placeholders to .env.example and keep real secrets out of source control and browser code.",
  "For business knowledge or RAG, check the authenticated user's and tenant's permission on every retrieval before any content reaches the model. Preserve source citations, support source removal and re-indexing, and never rely on the model to enforce access control.",
  "For connected actions, expose only explicit allowlisted server functions with validated inputs. Re-check the signed-in user's authorization at execution time, require confirmation before writes or consequential actions by default, and record appropriate audit metadata. Treat model output and retrieved content as untrusted.",
  "Do not build retrieval, embeddings, or autonomous actions unless they are requested and justified by the user task. Explain provider setup and likely cost or data movement when choosing an integration; use Authenik8 identity and server-side authorization as the boundary.",
  "For web output, create index.html at the project root and keep asset paths relative.",
  "Every project root must include a package.json whose scripts.start boots the app.",
  "For a static site, also write a tiny zero-dependency node server.js that serves the",
  "directory (npm start = node server.js) so the user can run it, not only preview it.",
  "Authenik8-generated projects use Express + TypeScript, rotating JWTs with stateful",
  "Redis-backed sessions, Prisma, strict cookies, CSRF, and server-side authorization.",
  CANON_BUILD_PROMPT,
  "Never suggest client-held secrets, tokens in browser storage, frontend route guards",
  "as authorization, or disabling CSRF/origin checks. Prefer free-tier OpenRouter models",
  "and plain, reviewable code. Use plain punctuation, no em dashes.",
].join(" ");

/** Tools offered to the parent model: studio tools plus delegation. */
const PARENT_TOOL_DEFINITIONS = [
  ...toolDefinitions,
  exploreToolDefinition,
  reviewToolDefinition,
  buildToolDefinition,
];

type GenerationContext = {
  deps: WebStudioDeps;
  gateway: Gateway;
  leases: LeaseManager;
  log: SessionLog;
  maxToolRounds: number;
  mode: ChatMode;
  res: import("node:http").ServerResponse;
  runner: Runner;
  signal: AbortSignal;
  compaction: { last: string };
};

type ChildBudget = { used: boolean };

type CallContext = {
  gateway: Gateway;
  model: string;
  sandboxRoot: string;
  signal: AbortSignal;
  leases: LeaseManager;
  budget: ChildBudget;
};

/** Send one model round and collect its text and tool-call fragments. */
async function streamModelRound(
  context: GenerationContext,
  model: string,
  round: number,
  finalRound: boolean,
  messages: Parameters<Gateway["chatStream"]>[0]["messages"],
): Promise<{ text: string; fragments: ToolCallDelta[]; error: unknown }> {
  let text = "";
  const fragments: ToolCallDelta[] = [];
  let error: unknown = null;
  sseEvent(context.res, { round, mode: context.mode });

  // Mode shapes the tool surface: think has no tools, plan only updates the
  // plan, build/debug get the full set. Reasoning is requested in think mode
  // (and build/debug when the model supports it) so the UI can show thinking.
  const modeTools = finalRound || context.mode === "think"
    ? undefined
    : context.mode === "plan"
      ? PARENT_TOOL_DEFINITIONS.filter((tool) => tool.name === "update_plan")
      : PARENT_TOOL_DEFINITIONS;
  const systemPrompt = `${MODE_PREAMBLES[context.mode]} ${SYSTEM_PROMPT}${finalRound ? ` ${FINAL_TOOL_BUDGET_INSTRUCTION}` : ""}`;

  try {
    for await (const chunk of context.gateway.chatStream({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      ...(modeTools !== undefined ? { tools: modeTools } : {}),
      ...(context.mode === "think" ? { reasoning: true } : {}),
      signal: context.signal,
    })) {
      if (chunk.reasoning !== null) {
        sseEvent(context.res, { reasoning: chunk.reasoning });
      }
      if (chunk.delta !== null) {
        text += chunk.delta;
        sseEvent(context.res, { delta: chunk.delta });
      }
      if (chunk.toolCalls !== null) fragments.push(...chunk.toolCalls);
      if (chunk.usage !== null) sseEvent(context.res, { usage: chunk.usage });
      if (chunk.finishReason !== null) sseEvent(context.res, { finishReason: chunk.finishReason });
    }
  } catch (caught) {
    error = caught;
  }
  return { text, fragments, error };
}

/** Build and run a delegated builder child, holding its directory lease. */
async function executeBuilderCall(
  call: ParentToolCall,
  context: CallContext,
): Promise<ToolOutcome> {
  let task: string | null = null;
  let directory: string | null = null;
  try {
    const parsedArgs = buildTaskSchema.safeParse(JSON.parse(call.arguments));
    if (parsedArgs.success) {
      task = parsedArgs.data.task;
      directory = parsedArgs.data.directory;
    }
  } catch {
    // The schema error below covers invalid JSON too.
  }
  if (task === null || directory === null) {
    return {
      ok: false,
      result: `Error: build_project needs a JSON object with a non-empty task string of at most ${SUBAGENT_MAX_TASK_CHARS} characters and a sandbox-relative directory string of at most ${BUILDER_MAX_DIRECTORY_CHARS} characters.`,
    };
  }
  const acquired = context.leases.acquire(context.sandboxRoot, directory);
  if (!acquired.ok) {
    return { ok: false, result: `Error: build_project could not start: ${acquired.error}` };
  }
  context.budget.used = true;
  try {
    const child = await runBuilder({
      gateway: context.gateway,
      model: context.model,
      sandboxRoot: context.sandboxRoot,
      task,
      signal: context.signal,
      lease: acquired.lease,
    });
    return { ok: child.ok, result: child.result, childId: child.childId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "builder failed";
    return { ok: false, result: `Error: builder failed: ${message}` };
  } finally {
    context.leases.release(acquired.lease);
  }
}

/** Resolve one parent call: a studio tool or a single delegated child. */
async function executeParentCall(call: ParentToolCall, context: CallContext): Promise<ToolOutcome> {
  const isExplorer = call.name === "explore_project";
  const isReviewer = call.name === "review_project";
  const isBuilder = call.name === "build_project";
  if (!isExplorer && !isReviewer && !isBuilder) {
    return executeTool(call.name, call.arguments, context.sandboxRoot);
  }
  if (context.budget.used) {
    return {
      ok: false,
      result: `Error: only one ${call.name} call is allowed per turn. Use the report you already have.`,
    };
  }

  if (isBuilder) {
    return executeBuilderCall(call, context);
  }

  const schema = isReviewer ? reviewTaskSchema : exploreTaskSchema;
  let task: string | null = null;
  try {
    const parsedArgs = schema.safeParse(JSON.parse(call.arguments));
    if (parsedArgs.success) task = parsedArgs.data.task;
  } catch {
    // The schema error below covers invalid JSON too.
  }
  if (task === null) {
    return {
      ok: false,
      result: `Error: ${call.name} needs a JSON object with a non-empty task string of at most ${SUBAGENT_MAX_TASK_CHARS} characters.`,
    };
  }
  context.budget.used = true;
  try {
    const child = await (isReviewer ? runReviewer : runExplorer)({
      gateway: context.gateway,
      model: context.model,
      sandboxRoot: context.sandboxRoot,
      task,
      signal: context.signal,
    });
    return { ok: child.ok, result: child.result, childId: child.childId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "child failed";
    return {
      ok: false,
      result: `Error: ${isReviewer ? "reviewer" : "explorer"} failed: ${message}`,
    };
  }
}

/** Execute one round of tool calls, recording each result in the log. */
async function runToolRound(
  calls: ParentToolCall[],
  context: CallContext,
  log: SessionLog,
  res: GenerationContext["res"],
  signal: AbortSignal,
): Promise<void> {
  for (const batch of planToolBatches(calls)) {
    if (signal.aborted) {
      // An assistant tool call must never reach a later request
      // without a result: record undispatched calls as unknowns.
      for (const call of batch.calls) {
        await log.append({ role: "tool", toolCallId: call.id, content: TOOL_OUTCOME_UNKNOWN });
      }
      continue;
    }

    // Start every call in the batch before awaiting any result:
    // read-only calls overlap, a barrier batch is a single call.
    for (const call of batch.calls) {
      sseEvent(res, { tool: { id: call.id, name: call.name, phase: "start" } });
    }
    const outcomes = await executeToolBatch(batch, (call) => executeParentCall(call, context));
    for (let index = 0; index < batch.calls.length; index++) {
      const call = batch.calls[index]!;
      const outcome = outcomes[index]!;
      // childId is local viewer metadata: it lets a refresh pair this
      // result with its transcript. The provider adapter maps known
      // message fields only, so it never reaches the model.
      const toolMessage: {
        role: "tool";
        content: string;
        toolCallId: string;
        childId?: string;
      } = { role: "tool", content: outcome.result, toolCallId: call.id };
      if (outcome.childId !== undefined) toolMessage.childId = outcome.childId;
      await log.append(toolMessage);
      sseEvent(res, {
        tool: {
          id: call.id,
          name: call.name,
          phase: "done",
          ok: outcome.ok,
          summary: outcome.result.split("\n")[0] ?? "",
          ...(outcome.childId !== undefined ? { childId: outcome.childId } : {}),
        },
      });
      if (call.name === "update_plan" && outcome.ok) {
        const plan = parsePlanArgs(call.arguments);
        if (plan !== null) sseEvent(res, { plan });
      }
    }
  }
}

/** Refresh the runtime snapshot and compact history for one model round. */
async function prepareTurnMessages(
  context: GenerationContext,
  rounds: number,
): Promise<CompactionResult["messages"]> {
  if (rounds > 1) {
    // Tool rounds can change the project: refresh the snapshot before
    // the next model request. Unchanged snapshots are deduplicated.
    const refreshed = await buildRuntimeContext({
      sandboxRoot: context.deps.sandboxRoot,
      running: context.runner.isRunning(),
    }).catch(() => null);
    if (refreshed !== null) await ensureRuntimeContext(context.log, refreshed);
  }
  const history = await context.log.history();
  const compacted = compactForRequest(
    history,
    context.deps.contextBudgetChars ?? DEFAULT_CONTEXT_BUDGET_CHARS,
  );
  if (compacted.pruned > 0) {
    // One notice per distinct compaction per turn, not once per round.
    const signature = `${compacted.pruned}:${compacted.savedChars}`;
    if (signature !== context.compaction.last) {
      context.compaction.last = signature;
      sseEvent(context.res, {
        compaction: { pruned: compacted.pruned, savedChars: compacted.savedChars },
      });
    }
  }
  return compacted.messages;
}

/** Commit the final assistant answer, substituting the budget fallback text. */
async function finishGeneration(
  context: GenerationContext,
  text: string,
  finalRound: boolean,
  rounds: number,
): Promise<void> {
  const finalText = finalRound && text.trim() === ""
    ? "Tool budget reached. I stopped before making more changes. Send another message to continue."
    : text;
  if (finalRound && text.trim() === "") sseEvent(context.res, { delta: finalText });
  await context.log.append({ role: "assistant", content: finalText });
  sseEvent(context.res, { done: true, rounds });
}

/** Run model rounds until the assistant answers, the budget ends, or the client leaves. */
async function runGeneration(context: GenerationContext, model: string): Promise<void> {
  let rounds = 0;
  let toolRounds = 0;
  const budget: ChildBudget = { used: false };

  while (true) {
    const finalRound = toolRounds >= context.maxToolRounds;
    rounds++;
    if (finalRound) {
      sseEvent(context.res, {
        note: `Tool budget reached (${context.maxToolRounds} tool rounds). The assistant is wrapping up with what is complete; send another message to continue.`,
      });
    }

    const messages = await prepareTurnMessages(context, rounds);
    const { text, fragments, error } = await streamModelRound(
      context,
      model,
      rounds,
      finalRound,
      messages,
    );
    if (error !== null) {
      // Cancellation keeps what the user already saw, exactly as the
      // harness finalizes a cancelled stream. Other failures record no
      // assistant message, so the next turn starts from a valid log.
      if (context.signal.aborted && text.length > 0) {
        await context.log.append({ role: "assistant", content: text });
      }
      throw error;
    }

    const calls = assembleToolCalls(fragments);
    if (calls.length === 0 || finalRound) {
      // The final round has no tools, so any calls it still emits are
      // ignored. This preserves the last tool results and gives the
      // user a summary instead of a dead-end budget error.
      await finishGeneration(context, text, finalRound, rounds);
      return;
    }

    toolRounds++;
    await context.log.append({ role: "assistant", content: text, toolCalls: calls });
    await runToolRound(
      calls,
      {
        gateway: context.gateway,
        model,
        sandboxRoot: context.deps.sandboxRoot,
        signal: context.signal,
        leases: context.leases,
        budget,
      },
      context.log,
      context.res,
      context.signal,
    );
    if (context.signal.aborted) return;
  }
}

/**
 * Read and validate the chat request. Null means the response was already
 * sent (busy, missing key, oversized body, or invalid payload).
 */
async function readChatRequest(
  ctx: RouteContext,
): Promise<{ key: string; model: string; message: string; mode: ChatMode } | null> {
  const { req, res, session } = ctx;
  if (session.chatBusy || session.agentBusy) {
    sendJson(res, 409, { error: "Another build is already in progress" });
    return null;
  }
  const key = apiKeyFrom(req);
  if (key === null) {
    sendJson(res, 401, { error: "Missing X-OpenRouter-Key header" });
    return null;
  }
  const body = await readBody(req);
  if (body === null) {
    sendJson(res, 413, { error: "Request body too large" });
    return null;
  }
  const rawChat = parseJsonBody(body);
  if (rawChat === undefined) {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return null;
  }
  const parsed = chatBodySchema.safeParse(rawChat);
  if (!parsed.success) {
    sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return null;
  }
  return { key, model: parsed.data.model, message: parsed.data.message, mode: parsed.data.mode };
}

/** Commit the user turn before streaming so history stays replayable. */
async function commitUserTurn(
  ctx: RouteContext,
  message: string,
): Promise<{ log: SessionLog; turnStart: number }> {
  const { deps, runner, session } = ctx;
  const log = sessionLog(deps, session);
  const runtimeContext = await buildRuntimeContext({
    sandboxRoot: deps.sandboxRoot,
    running: runner.isRunning(),
  }).catch(() => null);
  if (runtimeContext !== null) {
    await ensureRuntimeContext(log, runtimeContext);
  }
  await log.append({ role: "user", content: message });
  return { log, turnStart: (await log.history()).length };
}

/**
 * Run one generation, retrying an agents-only provider rejection with the
 * app-traffic model. Failures surface as SSE data; nothing is thrown upward.
 */
async function runGenerationWithFallback(
  generation: GenerationContext,
  log: SessionLog,
  turnStart: number,
  model: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    await runGeneration(generation, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : "stream failed";
    const after = (await log.history()).length;
    if (
      message.includes("agentic harnesses")
      && model !== FALLBACK_MODEL
      && !signal.aborted
      && after === turnStart
    ) {
      // Agent-only providers 403 the whole product: complete this
      // message with the app-traffic router instead of dead-ending.
      sseEvent(generation.res, {
        note: `${model} rejects app traffic (agents-only provider), so Authenik8 completed this message with ${FALLBACK_MODEL}. Pick it in the dropdown to keep it.`,
      });
      await runGeneration(generation, FALLBACK_MODEL);
    } else if (!signal.aborted) {
      sseEvent(generation.res, { error: message });
    }
  }
}

/**
 * One streaming build turn: commit the user message, then run the model/tool
 * loop until the assistant answers, the budget ends, or the client leaves.
 */
export async function handleChatRoute(ctx: RouteContext): Promise<boolean> {
  const { deps, leases, maxToolRounds, req, res, runner, session, url } = ctx;
  if (url.pathname !== "/api/chat" || req.method !== "POST") return false;

  const request = await readChatRequest(ctx);
  if (request === null) return true;

  const { log, turnStart } = await commitUserTurn(ctx, request.message);
  session.chatBusy = true;

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const abort = new AbortController();
  abortOnDisconnect(res, abort);

  try {
    const gateway = deps.gatewayFor(request.key);
    const generation: GenerationContext = {
      deps,
      gateway,
      leases,
      log,
      maxToolRounds,
      mode: request.mode,
      res,
      runner,
      signal: abort.signal,
      compaction: { last: "" },
    };
    await runGenerationWithFallback(generation, log, turnStart, request.model, abort.signal);
  } catch (error) {
    // ModelsError messages are key-safe by contract in the models package.
    const message = error instanceof Error ? error.message : "stream failed";
    if (!abort.signal.aborted) {
      sseEvent(res, { error: message });
    }
  } finally {
    session.chatBusy = false;
    res.end();
  }
  return true;
}
