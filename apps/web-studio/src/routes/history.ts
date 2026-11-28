import { z } from "zod";

import { readIntegrationStatus } from "../integrations.js";
import { parseJsonBody, readBody, sendJson } from "../http.js";
import { planFromMessages } from "../plan.js";
import { createSession, isValidSessionId, listSessions, sessionExists } from "../session-store.js";
import { sessionLog, type RouteContext } from "../studio-types.js";

const activateBodySchema = z.object({
  id: z.string().min(1).max(80),
});

async function listSessionsRoute(ctx: RouteContext): Promise<void> {
  return listSessions(ctx.deps.sandboxRoot, ctx.session.activeSessionId).then((sessions) => sendJson(ctx.res, 200, sessions));
}

async function createSessionRoute(ctx: RouteContext): Promise<void> {
  if (ctx.session.chatBusy || ctx.session.agentBusy) { sendJson(ctx.res, 409, { error: "Another build is already in progress" }); return; }
  const id = await createSession(ctx.deps.sandboxRoot);
  ctx.session.activeSessionId = id;
  ctx.session.log = null;
  sendJson(ctx.res, 201, { ok: true, id });
}

async function activateSessionRoute(ctx: RouteContext): Promise<void> {
  if (ctx.session.chatBusy || ctx.session.agentBusy) { sendJson(ctx.res, 409, { error: "Another build is already in progress" }); return; }
  const body = await readBody(ctx.req);
  if (body === null) { sendJson(ctx.res, 413, { error: "Request body too large" }); return; }
  const raw = parseJsonBody(body);
  if (raw === undefined) { sendJson(ctx.res, 400, { error: "Invalid JSON body" }); return; }
  const parsed = activateBodySchema.safeParse(raw);
  if (!parsed.success || !isValidSessionId(parsed.data.id)) { sendJson(ctx.res, 400, { error: "Invalid session id" }); return; }
  if (!(await sessionExists(ctx.deps.sandboxRoot, parsed.data.id))) { sendJson(ctx.res, 404, { error: "Session not found" }); return; }
  ctx.session.activeSessionId = parsed.data.id;
  ctx.session.log = null;
  sendJson(ctx.res, 200, { ok: true, id: ctx.session.activeSessionId });
}

/** Conversation history and the local session switcher. */
export async function handleHistoryRoutes(ctx: RouteContext): Promise<boolean> {
  const { pathname } = ctx.url;
  const method = ctx.req.method;
  if (pathname === "/api/sessions" && method === "GET") { await listSessionsRoute(ctx); return true; }
  if (pathname === "/api/sessions" && method === "POST") { await createSessionRoute(ctx); return true; }
  if (pathname === "/api/sessions/activate" && method === "POST") { await activateSessionRoute(ctx); return true; }
  if (pathname === "/api/reset" && method === "POST") { await sessionLog(ctx.deps, ctx.session).reset(); sendJson(ctx.res, 200, { ok: true }); return true; }
  if (pathname === "/api/history" && method === "GET") {
    const messages = await sessionLog(ctx.deps, ctx.session).history();
    sendJson(ctx.res, 200, { sessionId: ctx.session.activeSessionId, messages, plan: planFromMessages(messages) });
    return true;
  }
  if (pathname === "/api/integrations" && method === "GET") { sendJson(ctx.res, 200, await readIntegrationStatus(ctx.deps.sandboxRoot)); return true; }
  return false;
}
