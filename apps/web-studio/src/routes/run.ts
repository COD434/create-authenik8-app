import { mkdir } from "node:fs/promises";

import { sendJson, sseEvent } from "../http.js";
import { npmRunCommands } from "../runner.js";
import { ensureStaticRunnable, runBlocker } from "../run-provisioning.js";
import type { RouteContext } from "../studio-types.js";

/** Project run status, start (SSE), and stop. */
export async function handleRunRoutes(ctx: RouteContext): Promise<boolean> {
  const { deps, req, res, runner, session, url } = ctx;

  if (url.pathname === "/api/run/status" && req.method === "GET") {
    sendJson(res, 200, { running: runner.isRunning() });
    return true;
  }

  if (url.pathname === "/api/run" && req.method === "POST") {
    if (runner.isRunning()) {
      sendJson(res, 409, { error: "The project is already running" });
      return true;
    }
    // Static apps get runnable in place first: deterministic local files
    // (package.json + server.js), never clobbered, then the normal gate.
    const provisioned = await ensureStaticRunnable(deps.sandboxRoot);
    if (typeof provisioned === "string") {
      sendJson(res, 422, { error: provisioned });
      return true;
    }
    // Fail closed when the sandbox holds no runnable project: npm would
    // otherwise resolve scripts outside the sandbox (it walks up the tree).
    const blocker = await runBlocker(deps.sandboxRoot);
    if (blocker !== null) {
      sendJson(res, 422, { error: blocker });
      return true;
    }
    // Commands are computed per run from the sandbox's own manifest
    // (install, optional build, start). This await must happen BEFORE the
    // SSE headers go out: once the headers flush, the route may not yield
    // again before starting the runner.
    const commands = await npmRunCommands(deps.sandboxRoot);
    // npm spawn needs a real cwd: bootstrap the sandbox if it does not
    // exist yet (no chat/agent run may have created it).
    await mkdir(deps.sandboxRoot, { recursive: true });
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.flushHeaders(); // headers go out even before the runner emits anything
    session.runRes = res;
    if (provisioned !== null) {
      sseEvent(res, { runOut: provisioned.note }); // top of the output, before install lines
    }
    runner.start(deps.sandboxRoot, commands); // synchronous: no yield after flushHeaders
    return true;
  }

  if (url.pathname === "/api/run/stop" && req.method === "POST") {
    runner.stop();
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
