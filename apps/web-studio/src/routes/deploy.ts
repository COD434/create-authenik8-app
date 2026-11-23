import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  IntegrationError,
  deployStaticToNetlify,
  deployStaticToVercel,
  detectDeployTokens,
  parseDatabaseUrl,
  readIntegrationStatus,
  verifyDeployment,
  verifySupabase,
  writeProjectEnv,
} from "../integrations.js";
import { abortOnDisconnect, parseJsonBody, readBody, sendJson, sseEvent } from "../http.js";
import type { RouteContext } from "../studio-types.js";

/**
 * Integration requests carry per-request credentials. Tokens and keys stay in
 * the request, are used for one outbound call, and are never written to the
 * session log, the sandbox, or any response body.
 */
const supabaseConnectBodySchema = z.object({
  url: z.string().min(1).max(300),
  anonKey: z.string().min(8).max(4_096),
  databaseUrl: z.string().max(4_096).optional(),
  apply: z.boolean().optional(),
  deploy: z.boolean().optional(),
});

const vercelDeployBodySchema = z.object({
  token: z.string().trim().min(8).max(1_000),
  name: z.string().max(100).optional(),
});

const netlifyDeployBodySchema = z.object({
  token: z.string().trim().min(8).max(1_000),
  name: z.string().max(100).optional(),
  siteId: z.string().max(200).optional(),
});

async function readJsonRequest(ctx: RouteContext): Promise<unknown | undefined> {
  const body = await readBody(ctx.req);
  if (body === null) {
    sendJson(ctx.res, 413, { error: "Request body too large" });
    return undefined;
  }
  const raw = parseJsonBody(body);
  if (raw === undefined) {
    sendJson(ctx.res, 400, { error: "Invalid JSON body" });
    return undefined;
  }
  return raw;
}

function sendIntegrationFailure(res: RouteContext["res"], error: unknown): boolean {
  if (error instanceof IntegrationError) {
    sendJson(res, error.status, { error: error.message, code: error.code });
    return true;
  }
  return false;
}

/**
 * Persist the verified Supabase connection as project env keys. Only called
 * when the request explicitly asks to apply; the key is taken from the
 * request body and is never logged or echoed back.
 */
async function applySupabaseEnv(
  deps: RouteContext["deps"],
  url: string,
  anonKey: string,
  databaseUrl: string | null,
): Promise<Awaited<ReturnType<typeof writeProjectEnv>> | null> {
  const values: Record<string, string> = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
  };
  if (databaseUrl !== null) {
    values.DATABASE_URL = databaseUrl;
    values.AUTHENIK8_LOCAL_DATABASE = "external";
  }
  return writeProjectEnv(deps.sandboxRoot, values);
}

/**
 * Run the project's schema push (`npm run db:migrate`) against the connected
 * Supabase database, streaming output over SSE. Fixed command shape — the
 * studio never runs model-chosen commands; only the project's own script.
 */
function runSchemaPush(ctx: RouteContext): Promise<void> {
  const { deps, res } = ctx;
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(npmCli)) {
    sseEvent(res, { supabaseDeploy: { phase: "error", message: "npm was not found next to the Node executable." } });
    res.end();
    return Promise.resolve();
  }
  const abort = new AbortController();
  abortOnDisconnect(res, abort);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [npmCli, "run", "db:migrate"], {
      cwd: deps.sandboxRoot,
      windowsHide: true,
      signal: abort.signal,
    });
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      sseEvent(res, { supabaseDeploy: { phase: code === 0 ? "done" : "error", code } });
      if (!res.writableEnded) res.end();
      resolve();
    };
    const drain = (chunk: Buffer) => {
      if (abort.signal.aborted) return;
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim().length > 0) sseEvent(res, { supabaseDeploy: { phase: "line", line } });
      }
    };
    child.stdout?.on("data", drain);
    child.stderr?.on("data", drain);
    child.on("error", (error) => {
      sseEvent(res, { supabaseDeploy: { phase: "error", message: error.message } });
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

async function connectSupabase(ctx: RouteContext): Promise<void> {
  const { deps, res } = ctx;
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = supabaseConnectBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const outbound = deps.integrationFetch ?? fetch;
  try {
    // Validate the database string before spending a network call. The
    // connection is not opened here: a URL check must not pretend to
    // prove live credentials.
    const database = parsed.data.databaseUrl !== undefined && parsed.data.databaseUrl.trim() !== ""
      ? parseDatabaseUrl(parsed.data.databaseUrl)
      : null;
    const target = await verifySupabase({
      url: parsed.data.url,
      key: parsed.data.anonKey,
      fetch: outbound,
    });

    const write = parsed.data.apply === true
      ? await applySupabaseEnv(
        deps,
        target.url,
        parsed.data.anonKey.trim(),
        database === null ? null : database.url,
      )
      : null;

    // One-click deploy: stream the connection result, then push the schema.
    if (parsed.data.deploy === true) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      sseEvent(res, {
        supabaseConnect: {
          ok: true,
          verified: true,
          applied: write !== null,
          supabase: { url: target.url, keyKind: target.keyKind, projectRef: target.projectRef },
          database: database === null ? null : { host: database.host, port: database.port, database: database.database, notes: database.notes },
        },
      });
      if (database === null) {
        sseEvent(res, { supabaseDeploy: { phase: "error", message: "Add the database connection string to push the schema." } });
        if (!res.writableEnded) res.end();
        return;
      }
      await runSchemaPush(ctx);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      verified: true,
      applied: write !== null,
      supabase: {
        url: target.url,
        keyKind: target.keyKind,
        projectRef: target.projectRef,
      },
      database: database === null
        ? null
        : {
          host: database.host,
          port: database.port,
          database: database.database,
          notes: database.notes,
        },
      ...(write === null
        ? {}
        : { env: { keys: write.keys, replaced: write.replaced, added: write.added } }),
      status: await readIntegrationStatus(deps.sandboxRoot),
    });
  } catch (error) {
    if (!sendIntegrationFailure(res, error)) throw error;
  }
}

async function deployVercel(ctx: RouteContext): Promise<void> {
  const { deps, res } = ctx;
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = vercelDeployBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const abort = new AbortController();
  abortOnDisconnect(res, abort);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const sseError = (message: string, status: number) => {
    sseEvent(res, { error: message });
    if (!res.writableEnded) res.end();
  };
  const stream = await createDeploymentStream(res, abort.signal);
  try {
    const result = await deployStaticToVercel({
      signal: abort.signal,
      sandboxRoot: deps.sandboxRoot,
      token: parsed.data.token,
      name: parsed.data.name ?? "",
      fetch: deps.integrationFetch ?? fetch,
      onEvent: stream,
    });
    const verify = await verifyDeployment(
      deps.integrationFetch ?? fetch,
      result.url ?? "",
      abort.signal,
    );
    sseEvent(res, { deployment: { ...result, verified: verify.verified } });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The deploy failed.";
    sseError(message, 400);
    if (abort.signal.aborted) return;
  }
}

function createDeploymentStream(
  res: RouteContext["res"],
  signal: AbortSignal,
): (event: { phase: string; detail?: string }) => void {
  const onAbort = (): void => {
    if (!res.writableEnded) res.end();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return (event) => {
    if (signal.aborted) return;
    if (!res.writableEnded) sseEvent(res, { state: event.detail ?? event.phase });
  };
}

async function deployNetlify(ctx: RouteContext): Promise<void> {
  const { deps, res } = ctx;
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = netlifyDeployBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const abort = new AbortController();
  abortOnDisconnect(res, abort);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const sseError = (message: string) => {
    sseEvent(res, { error: message });
    if (!res.writableEnded) res.end();
  };
  const stream = createDeploymentStream(res, abort.signal);
  try {
    const result = await deployStaticToNetlify({
      sandboxRoot: deps.sandboxRoot,
      token: parsed.data.token,
      name: parsed.data.name ?? "",
      siteId: parsed.data.siteId ?? "",
      fetch: deps.integrationFetch ?? fetch,
      signal: abort.signal,
      onEvent: stream,
    });
    const verify = await verifyDeployment(
      deps.integrationFetch ?? fetch,
      result.url ?? "",
      abort.signal,
    );
    sseEvent(res, { deployment: { ...result, verified: verify.verified } });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The deploy failed.";
    sseError(message);
    if (abort.signal.aborted) return;
  }
}

/** Deploy-token availability: detected on the machine, values stay browser-side. */
async function detectTokens(ctx: RouteContext): Promise<boolean> {
  const { deps, res } = ctx;
  try {
    const detected = await detectDeployTokens(process.env.HOME ?? process.env.USERPROFILE ?? "");
    sendJson(res, 200, { tokens: detected });
  } catch (error) {
    sendJson(res, 500, { error: "Could not check for deploy tokens." });
    void error;
  }
  return true;
}

/** Supabase connection verification and static deploys to Vercel or Netlify. */
export async function handleDeployRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, url } = ctx;
  if (url.pathname === "/api/integrations/supabase" && req.method === "POST") {
    await connectSupabase(ctx);
    return true;
  }
  if (url.pathname === "/api/deploy/vercel" && req.method === "POST") {
    await deployVercel(ctx);
    return true;
  }
  if (url.pathname === "/api/deploy/netlify" && req.method === "POST") {
    await deployNetlify(ctx);
    return true;
  }
  if (url.pathname === "/api/deploy/tokens" && req.method === "GET") {
    return await detectTokens(ctx);
  }
  return false;
}
