import { mkdir } from "node:fs/promises";

import { readBody, sendJson } from "../http.js";
import type { RouteContext } from "../studio-types.js";
import { codeRabbitStatus, reviewWithCodeRabbit } from "../coderabbit.js";

/** CodeRabbit status and an explicitly confirmed review of the sandbox. */
export async function handleCodeRabbitRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url } = ctx;

  if (url.pathname === "/api/coderabbit/status" && req.method === "GET") {
    sendJson(res, 200, await codeRabbitStatus(ctx.deps.sandboxRoot));
    return true;
  }

  if (url.pathname === "/api/coderabbit/review" && req.method === "POST") {
    const raw = await readBody(req);
    if (raw === null) {
      sendJson(res, 413, { error: "Request body too large" });
      return true;
    }
    let body: unknown;
    try { body = JSON.parse(raw); } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }
    if (typeof body !== "object" || body === null || (body as { confirm?: unknown }).confirm !== true) {
      sendJson(res, 400, { error: "Explicit review confirmation is required" });
      return true;
    }
    await mkdir(ctx.deps.sandboxRoot, { recursive: true });
    const result = await reviewWithCodeRabbit(ctx.deps.sandboxRoot);
    sendJson(res, result.ok ? 200 : 502, result);
    return true;
  }

  return false;
}
