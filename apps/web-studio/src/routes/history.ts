import { z } from "zod";

import { readIntegrationStatus } from "../integrations.js";
import { parseJsonBody, readBody, sendJson } from "../http.js";
import { planFromMessages } from "../plan.js";
import { createSession, isValidSessionId, listSessions, sessionExists } from "../session-store.js";
import { sessionLog, type RouteContext } from "../studio-types.js";

const activateBodySchema = z.object({
  id: z.string().min(1).max(80),
});

/** Conversation history and the local session switcher. */
export async function handleHistoryRoutes(ctx: RouteContext): Promise<boolean> {
  const { deps, req, res, session, url } = ctx;

  if (url.pathname === "/api/sessions" && req.method === "GET") {
    sendJson(res, 200, await listSessions(deps.sandboxRoot, session.activeSessionId));
    return true;
  }

  if (url.pathname === "/api/sessions" && req.method === "POST") {
    if (session.chatBusy || session.agentBusy) {
      sendJson(res, 409, { error: "Another build is already in progress" });
      return true;
    }
    const id = await createSession(deps.sandboxRoot);
    session.activeSessionId = id;
    session.log = null;
    sendJson(res, 201, { ok: true, id });
    return true;
  }

  if (url.pathname === "/api/sessions/activate" && req.method === "POST") {
    if (session.chatBusy || session.agentBusy) {
      sendJson(res, 409, { error: "Another build is already in progress" });
      return true;
    }
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 413, { error: "Request body too large" });
      return true;
    }
    const raw = parseJsonBody(body);
    if (raw === undefined) {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    const parsed = activateBodySchema.safeParse(raw);
    if (!parsed.success || !isValidSessionId(parsed.data.id)) {
      sendJson(res, 400, { error: "Invalid session id" });
      return true;
    }
    if (!(await sessionExists(deps.sandboxRoot, parsed.data.id))) {
      sendJson(res, 404, { error: "Session not found" });
      return true;
    }
    session.activeSessionId = parsed.data.id;
    session.log = null;
    sendJson(res, 200, { ok: true, id: session.activeSessionId });
    return true;
  }

  if (url.pathname === "/api/reset" && req.method === "POST") {
    await sessionLog(deps, session).reset();
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/history" && req.method === "GET") {
    // The client restores from the same derived conversation the model
    // sees: one source of truth, no parallel UI state.
    const messages = await sessionLog(deps, session).history();
    sendJson(res, 200, { messages, plan: planFromMessages(messages) });
    return true;
  }

  if (url.pathname === "/api/integrations" && req.method === "GET") {
    // Status is derived from the sandbox .env by key name only. Values are
    // never returned: the UI learns what is configured, not what it says.
    sendJson(res, 200, await readIntegrationStatus(deps.sandboxRoot));
    return true;
  }

  return false;
}
