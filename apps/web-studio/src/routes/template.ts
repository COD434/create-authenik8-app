import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

import { abortOnDisconnect, parseJsonBody, readBody, sendJson, sseEvent } from "../http.js";
import {
  resolveBridge,
  seedSandboxFrom,
  spawnTemplateBridge,
  type Bridge,
  type TemplateSpec,
} from "../template-bridge.js";
import { sessionLog, type RouteContext } from "../studio-types.js";

/**
 * Template seed request. Every field is an enum-constrained flag value the
 * CLI itself validates ultimately — the studio only narrows the wire shape
 * so a request can never smuggle unexpected argv tokens through.
 */
const templateBodySchema = z.object({
  preset: z.enum(["base", "auth", "auth-oauth", "fullstack"]),
  frontend: z.enum(["react", "lovable", "next"]).optional(),
  oauthProviders: z.array(z.enum(["google", "github"])).optional(),
  database: z.enum(["sqlite", "postgresql"]),
  /** See TemplateSpec: omitted unless a production-seeding flow decides it. */
  runtime: z.enum(["node", "bun"]).optional(),
  packageManager: z.enum(["npm", "pnpm", "bun"]),
  usePrisma: z.boolean(),
  /** Seeds the fullstack template's demo projects and Pro launch guide. */
  demo: z.boolean().optional(),
  /** Seeding wipes the whole sandbox; without explicit confirmation: refused. */
  confirm: z.boolean(),
});

type TemplateRequest = z.infer<typeof templateBodySchema>;

function templateSpecFrom(data: TemplateRequest): TemplateSpec {
  return {
    preset: data.preset,
    ...(data.frontend !== undefined ? { frontend: data.frontend } : {}),
    ...(data.oauthProviders !== undefined
      ? { oauthProviders: data.oauthProviders }
      : data.preset === "fullstack"
        ? { oauthProviders: [] }
        : {}),
    database: data.database,
    ...(data.runtime !== undefined ? { runtime: data.runtime } : {}),
    packageManager: data.packageManager,
    usePrisma: data.usePrisma,
    ...(data.demo !== undefined ? { demo: data.demo } : {}),
  };
}

/**
 * Cross-field contracts mirror observed CLI behavior; the CLI remains
 * the validator of record for everything it accepts.
 */
function templateSpecError(spec: TemplateSpec, confirm: boolean): string | null {
  if (spec.preset === "fullstack" && spec.frontend === undefined) {
    return "The fullstack preset needs a frontend (react, lovable, or next).";
  }
  if (spec.frontend !== undefined && spec.preset !== "fullstack") {
    return "A frontend applies only to the fullstack preset.";
  }
  if (spec.preset === "fullstack" && spec.database !== "postgresql") {
    return "The fullstack preset requires PostgreSQL. On a machine without a database server, generate the auth preset with sqlite.";
  }
  if (spec.demo === true && spec.preset !== "fullstack") {
    return "Demo data applies only to the fullstack preset.";
  }
  if (!confirm) {
    return "Seeding replaces the entire sandbox (chat context resets with it). Resend with confirm: true.";
  }
  return null;
}

/** Stream the CLI run, then seed the sandbox and reset the conversation. */
async function seedFromTemplate(ctx: RouteContext, spec: TemplateSpec, bridge: Bridge): Promise<void> {
  const { deps, res, session } = ctx;
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const abort = new AbortController();
  abortOnDisconnect(res, abort);

  const stagingRoot = await mkdtemp(path.join(tmpdir(), "authenik8-bridge-"));
  try {
    sseEvent(res, { template: { phase: "start", via: bridge.kind } });
    const result = await spawnTemplateBridge({
      bridge,
      spec,
      cwd: stagingRoot,
      onLine: (line) => {
        if (!abort.signal.aborted) sseEvent(res, { template: { phase: "line", line } });
      },
      shouldAbort: () => abort.signal.aborted,
    });

    if (result.cancelled) return; // client is gone; cleanup runs in finally
    if (result.code !== 0) {
      if (!abort.signal.aborted) {
        sseEvent(res, { error: `Template generation failed (exit code ${result.code ?? "unknown"}). See the CLI output above.` });
      }
      return;
    }

    try {
      const seeded = await seedSandboxFrom({
        stagingProjectDir: result.projectDir,
        sandboxRoot: deps.sandboxRoot,
      });
      // The conversation described a sandbox that no longer exists.
      await sessionLog(deps, session).reset();
      sseEvent(res, { template: { phase: "seeded", files: seeded.files } });
      sseEvent(res, { done: true });
    } catch (seedError) {
      const message = seedError instanceof Error ? seedError.message : "staging validation failed";
      if (!abort.signal.aborted) sseEvent(res, { error: `Seeding failed: ${message}` });
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    if (!res.writableEnded) res.end();
  }
}

/** Seed the sandbox from a CLI template, streaming progress over SSE. */
export async function handleTemplateRoute(ctx: RouteContext): Promise<boolean> {
  const { deps, req, res, runner, session, url } = ctx;
  if (url.pathname !== "/api/template" || req.method !== "POST") return false;

  if (session.agentBusy) {
    sendJson(res, 409, { error: "An agent run is in progress. Wait for it before seeding." });
    return true;
  }
  if (runner.isRunning()) {
    sendJson(res, 409, { error: "A project is running. Stop it before seeding a new template." });
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
  const parsed = templateBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return true;
  }

  // The Studio fullstack form has no provider choice. The CLI requires an
  // explicit OAuth decision for fullstack, so default to password-only.
  const spec = templateSpecFrom(parsed.data);
  const specError = templateSpecError(spec, parsed.data.confirm);
  if (specError !== null) {
    sendJson(res, 422, { error: specError });
    return true;
  }

  const bridge = deps.bridge ?? resolveBridge(process.env);
  if (bridge === undefined || bridge === null) {
    sendJson(res, 502, {
      error: "No template bridge available: set AUTHENIK8_CLI_PATH to a create-authenik8-app clone, or install the CLI.",
    });
    return true;
  }

  await seedFromTemplate(ctx, spec, bridge);
  return true;
}
