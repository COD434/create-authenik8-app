import { readIntegrationStatus } from "../integrations.js";
import { sendJson } from "../http.js";
import { planFromMessages } from "../plan.js";
import { sessionLog, type RouteContext } from "../studio-types.js";

/** Conversation history, reset, and derived integration status. */
export async function handleHistoryRoutes(ctx: RouteContext): Promise<boolean> {
  const { deps, req, res, session, url } = ctx;

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
