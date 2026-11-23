import { mkdir } from "node:fs/promises";

import { CANON_BUILD_PROMPT } from "@authenik8/engineering-canon";
import { z } from "zod";

import { abortOnDisconnect, parseJsonBody, readBody, sendJson, sseEvent } from "../http.js";
import type { RouteContext } from "../studio-types.js";

const AGENT_OUTPUT_TAIL_CHARS = 4_000;

const agentBodySchema = z.object({
  prompt: z.string().min(1).max(8_000),
});

const AGENT_BRIEF_PREAMBLE = [
  "You are the Authenik8 build agent working inside a project directory.",
  "Build a real, runnable project for the brief below using Authenik8 conventions:",
  "Express + TypeScript, rotating JWTs with stateful server-side sessions, Prisma,",
  "strict cookies, CSRF protection, and server-side authorization.",
  "Never put secrets in client code; never store tokens in browser storage.",
  CANON_BUILD_PROMPT,
  "When you finish, print a short summary of what you created.",
].join(" ");

async function runAgent(ctx: RouteContext, prompt: string): Promise<void> {
  const { deps, res, session } = ctx;
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const abort = new AbortController();
  abortOnDisconnect(res, abort);

  // The user's button click is the consent for auto-approve; the run is
  // scoped to the sandbox cwd. Failures are data, not exceptions.
  session.agentBusy = true;
  sseEvent(res, { agent: { phase: "start" } });
  try {
    // OpenCode spawns with the sandbox as cwd: it must exist first.
    await mkdir(deps.sandboxRoot, { recursive: true });
    const result = await deps.agentRuntime.run({
      prompt: `${AGENT_BRIEF_PREAMBLE}\n\nBrief: ${prompt}`,
      cwd: deps.sandboxRoot,
      autoApprove: true,
      signal: abort.signal,
      // Live NDJSON pass-through: untrusted third-party events relayed
      // verbatim as data. Dropped when the client already hung up.
      onEvent: (event) => {
        if (!res.destroyed) sseEvent(res, { agentEvent: event });
      },
    });
    sseEvent(res, {
      agent: {
        phase: "done",
        ok: result.ok,
        errorCode: result.errorCode,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        sessionId: result.sessionId,
        outputTail: result.stdout.slice(-AGENT_OUTPUT_TAIL_CHARS),
        ...(result.ok ? {} : { errorTail: result.stderr.slice(-AGENT_OUTPUT_TAIL_CHARS) }),
      },
    });
  } catch (error) {
    // Adapter bugs only; run-level failures are structured results.
    const message = error instanceof Error ? error.message : "agent run failed";
    sseEvent(res, { agent: { phase: "done", ok: false, errorCode: "spawn_failed", errorTail: message } });
  } finally {
    session.agentBusy = false;
    res.end();
  }
}

/** Run the OpenCode agent against the sandbox, streaming its events over SSE. */
export async function handleAgentRoute(ctx: RouteContext): Promise<boolean> {
  const { req, res, session, url } = ctx;
  if (url.pathname !== "/api/agent" || req.method !== "POST") return false;

  if (session.agentBusy) {
    sendJson(res, 409, { error: "An agent run is already in progress" });
    return true;
  }
  const body = await readBody(req);
  if (body === null) {
    sendJson(res, 413, { error: "Request body too large" });
    return true;
  }
  const rawAgent = parseJsonBody(body);
  if (rawAgent === undefined) {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return true;
  }
  const parsed = agentBodySchema.safeParse(rawAgent);
  if (!parsed.success) {
    sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return true;
  }

  await runAgent(ctx, parsed.data.prompt);
  return true;
}
