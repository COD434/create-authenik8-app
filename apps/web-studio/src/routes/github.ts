import { z } from "zod";

import { IntegrationError } from "../integrations.js";
import {
  diagnoseGithubWorkflowRun,
  inspectGithubProject,
  listGithubWorkflowRuns,
  publishGithubProject,
  verifyGithubAccess,
} from "../github.js";
import { parseJsonBody, readBody, sendJson } from "../http.js";
import type { RouteContext } from "../studio-types.js";

const githubVerifyBodySchema = z.object({
  token: z.string().trim().min(10).max(1_000),
  repository: z.string().trim().min(3).max(205),
});

const githubActionsBodySchema = githubVerifyBodySchema.extend({
  runId: z.number().int().positive(),
});

const githubPublishBodySchema = githubVerifyBodySchema.extend({
  branch: z.string().trim().max(200).optional(),
  message: z.string().trim().max(200).optional(),
  includeWorkflow: z.boolean().default(false),
  reviewedFiles: z.boolean(),
});

async function readJsonRequest(ctx: RouteContext): Promise<unknown | undefined> {
  const rawBody = await readBody(ctx.req);
  if (rawBody === null) {
    sendJson(ctx.res, 413, { error: "Request body too large" });
    return undefined;
  }
  const raw = parseJsonBody(rawBody);
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

async function previewProject(ctx: RouteContext): Promise<void> {
  try {
    sendJson(ctx.res, 200, await inspectGithubProject(ctx.deps.sandboxRoot));
  } catch (error) {
    if (!sendIntegrationFailure(ctx.res, error)) throw error;
  }
}

async function verifyAccess(ctx: RouteContext): Promise<void> {
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = githubVerifyBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(ctx.res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  try {
    const verified = await verifyGithubAccess({
      token: parsed.data.token,
      repository: parsed.data.repository,
      fetch: ctx.deps.integrationFetch ?? fetch,
    });
    sendJson(ctx.res, 200, { ok: true, ...verified });
  } catch (error) {
    if (!sendIntegrationFailure(ctx.res, error)) throw error;
  }
}

async function listRuns(ctx: RouteContext): Promise<void> {
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = githubVerifyBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(ctx.res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  try {
    sendJson(ctx.res, 200, await listGithubWorkflowRuns({
      token: parsed.data.token,
      repository: parsed.data.repository,
      fetch: ctx.deps.integrationFetch ?? fetch,
    }));
  } catch (error) {
    if (!sendIntegrationFailure(ctx.res, error)) throw error;
  }
}

async function diagnoseRun(ctx: RouteContext): Promise<void> {
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = githubActionsBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(ctx.res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  try {
    sendJson(ctx.res, 200, await diagnoseGithubWorkflowRun({
      token: parsed.data.token,
      repository: parsed.data.repository,
      runId: parsed.data.runId,
      fetch: ctx.deps.integrationFetch ?? fetch,
    }));
  } catch (error) {
    if (!sendIntegrationFailure(ctx.res, error)) throw error;
  }
}

async function publishProject(ctx: RouteContext): Promise<void> {
  const raw = await readJsonRequest(ctx);
  if (raw === undefined) return;
  const parsed = githubPublishBodySchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(ctx.res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  try {
    const result = await publishGithubProject({
      sandboxRoot: ctx.deps.sandboxRoot,
      token: parsed.data.token,
      repository: parsed.data.repository,
      ...(parsed.data.branch === undefined ? {} : { branch: parsed.data.branch }),
      ...(parsed.data.message === undefined ? {} : { message: parsed.data.message }),
      includeWorkflow: parsed.data.includeWorkflow,
      reviewedFiles: parsed.data.reviewedFiles,
      fetch: ctx.deps.integrationFetch ?? fetch,
    });
    sendJson(ctx.res, 200, { ok: true, ...result });
  } catch (error) {
    if (!sendIntegrationFailure(ctx.res, error)) throw error;
  }
}

/** GitHub preview, credential verification, Actions runs, and publishing. */
export async function handleGithubRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, url } = ctx;
  if (url.pathname === "/api/github/preview" && req.method === "GET") {
    await previewProject(ctx);
    return true;
  }
  if (url.pathname === "/api/github/verify" && req.method === "POST") {
    await verifyAccess(ctx);
    return true;
  }
  if (url.pathname === "/api/github/actions/runs" && req.method === "POST") {
    await listRuns(ctx);
    return true;
  }
  if (url.pathname === "/api/github/actions/diagnose" && req.method === "POST") {
    await diagnoseRun(ctx);
    return true;
  }
  if (url.pathname === "/api/github/publish" && req.method === "POST") {
    await publishProject(ctx);
    return true;
  }
  return false;
}
