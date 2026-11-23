import { sendJson } from "../http.js";
import { listChildLogs, readChildLog } from "../subagent-log.js";
import type { RouteContext } from "../studio-types.js";

/** Child transcript metadata and one transcript by id. */
export async function handleSubagentRoutes(ctx: RouteContext): Promise<boolean> {
  const { deps, req, res, url } = ctx;

  if (url.pathname === "/api/subagents" && req.method === "GET") {
    // Child transcripts are local project evidence, not project files: the
    // list is metadata only, newest first, and never exposes an arbitrary
    // path. The transcript route below applies the same id discipline.
    const logs = await listChildLogs(deps.sandboxRoot);
    sendJson(res, 200, { logs });
    return true;
  }

  const match = /^\/api\/subagents\/([^/]+)$/.exec(url.pathname);
  if (match !== null && req.method === "GET") {
    const transcript = await readChildLog(deps.sandboxRoot, match[1]!);
    if (transcript === null) {
      sendJson(res, 404, { error: "Subagent transcript not found" });
      return true;
    }
    sendJson(res, 200, transcript);
    return true;
  }

  return false;
}
