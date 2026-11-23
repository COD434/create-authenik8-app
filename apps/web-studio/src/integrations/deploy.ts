import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { createZip, type ZipEntry } from "../zip.js";

import { IntegrationError, type FetchLike } from "./errors.js";
import { projectProfile, type ProjectProfile } from "./profile.js";

// ---------- static deploy collection ----------

const STATIC_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".txt", ".md",
  ".xml", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".wasm", ".map",
  ".mp4", ".webm", ".mp3", ".wav", ".pdf",
]);

const STATIC_NAMED_FILES = new Set([
  "CNAME",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "manifest.webmanifest",
  "favicon.ico",
]);

/** Files that belong to the local run, not to a static host. */
const LOCAL_ONLY_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "server.js",
  "server.mjs",
  "server.cjs",
]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".authenik8",
  ".git",
  ".vercel",
  ".netlify",
]);

const DEPLOY_FILE_LIMIT = 2_000;
const DEPLOY_DEPTH_LIMIT = 10;
const PROVIDER_MESSAGE_MAX = 300;

export type StaticDeployFiles = {
  entries: ZipEntry[];
  bytes: number;
};

/**
 * Collect only browser-servable files for a static deploy. Dotfiles (including
 * `.env`), node_modules, lockfiles, and local server entrypoints are excluded
 * so a host never sees secrets or tries to run the sandbox server.
 */
export async function collectStaticDeployFiles(sandboxRoot: string): Promise<StaticDeployFiles> {
  const entries: ZipEntry[] = [];
  let bytes = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (entries.length >= DEPLOY_FILE_LIMIT || depth > DEPLOY_DEPTH_LIMIT) return;
    const dirents = await readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      if (entries.length >= DEPLOY_FILE_LIMIT) return;
      if (dirent.name.startsWith(".") || SKIPPED_DIRECTORIES.has(dirent.name)) continue;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (LOCAL_ONLY_FILES.has(dirent.name)) continue;
      const extension = path.extname(dirent.name).toLowerCase();
      if (!STATIC_EXTENSIONS.has(extension) && !STATIC_NAMED_FILES.has(dirent.name)) continue;
      const data = await readFile(full);
      bytes += data.length;
      entries.push({
        name: path.relative(sandboxRoot, full).split(path.sep).join("/"),
        data,
      });
    }
  }

  await walk(sandboxRoot, 0);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  return { entries, bytes };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function staticDeployBlocker(profile: ProjectProfile): never {
  if (profile.kind === "fullstack") {
    throw new IntegrationError(
      422,
      "This project has an Express API. A static host would publish the frontend without identity, sessions, or the database, so the Studio will not run a deploy that breaks auth. Export the ZIP and host the API on a Node host such as Railway or Render.",
      "static_only",
    );
  }
  if (profile.kind === "server") {
    throw new IntegrationError(
      422,
      "This project is a server app. Vercel and Netlify static deploys cannot run its Node server. Export the ZIP and use a Node host such as Railway or Render.",
      "static_only",
    );
  }
  throw new IntegrationError(
    422,
    "There is no static site to deploy yet. Build a project with an index.html at the sandbox root first.",
    "no_static_site",
  );
}

async function staticEntriesForDeploy(sandboxRoot: string): Promise<StaticDeployFiles> {
  const profile = await projectProfile(sandboxRoot);
  if (profile.kind !== "static") staticDeployBlocker(profile);
  const files = await collectStaticDeployFiles(sandboxRoot);
  if (!files.entries.some((entry) => entry.name === "index.html")) {
    throw new IntegrationError(422, "The sandbox index.html is missing, so there is nothing to serve.", "no_static_site");
  }
  return files;
}

// ---------- provider plumbing ----------

function safeProviderMessage(
  body: Record<string, unknown> | null,
  fallback: string,
  secrets: string[],
): string {
  let message = fallback;
  const error = body?.error;
  if (typeof error === "string") {
    message = error;
  } else if (error !== null && typeof error === "object") {
    const nested = (error as Record<string, unknown>).message;
    if (typeof nested === "string") message = nested;
  } else if (typeof body?.message === "string") {
    message = body.message;
  }
  let safe = message.replace(/\s+/g, " ").trim().slice(0, PROVIDER_MESSAGE_MAX);
  for (const secret of secrets) {
    if (secret.length > 0) safe = safe.split(secret).join("[redacted]");
  }
  return safe === "" ? fallback : safe;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function providerFailure(
  provider: string,
  response: Response,
  body: Record<string, unknown> | null,
  secrets: string[],
): IntegrationError {
  if (response.status === 401 || response.status === 403) {
    return new IntegrationError(401, `${provider} rejected the access token. Check the token and try again.`, "provider_token_rejected");
  }
  if (response.status === 429) {
    return new IntegrationError(429, `${provider} rate limited this request. Wait a moment and try again.`, "provider_rate_limited");
  }
  const detail = safeProviderMessage(body, `${provider} returned HTTP ${response.status}.`, secrets);
  if (response.status >= 400 && response.status < 500) {
    return new IntegrationError(422, `${provider}: ${detail}`, "provider_rejected");
  }
  return new IntegrationError(502, `${provider} returned HTTP ${response.status}. Try again.`, "provider_unavailable");
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function sanitizeDeploymentName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// ---------- Vercel ----------

export type VercelDeployResult = {
  provider: "vercel";
  deploymentId: string;
  url: string | null;
  state: string;
  files: number;
  bytes: number;
};

const VERCEL_INLINE_LIMIT = 3 * 1024 * 1024;

function vercelSizeLimitError(bytes: number): IntegrationError {
  return new IntegrationError(
    422,
    `This static site is ${formatBytes(bytes)}. Vercel inline deploys are capped at ${formatBytes(VERCEL_INLINE_LIMIT)}. Use Netlify, or the Vercel CLI for a larger site.`,
    "site_too_large",
  );
}

async function pollVercelDeployment(
  fetchImpl: FetchLike,
  token: string,
  deploymentId: string,
  state: string,
  url: string | null,
): Promise<{ state: string; url: string | null }> {
  for (let attempt = 0; attempt < 8 && state !== "READY" && state !== "ERROR" && state !== "CANCELED"; attempt++) {
    await delay(1_000);
    try {
      const statusResponse = await fetchImpl(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!statusResponse.ok) break;
      const statusBody = await readJsonObject(statusResponse);
      if (typeof statusBody?.readyState === "string") state = statusBody.readyState;
      url = publicUrl(statusBody?.url) ?? url;
    } catch {
      break;
    }
  }
  return { state, url };
}

/**
 * Deploy a static site as an inline Vercel deployment. Vercel's API accepts
 * base64 files up to a small request body; larger sites are refused with a
 * clear suggestion instead of an opaque provider error.
 */
export async function deployStaticToVercel(options: {
  sandboxRoot: string;
  token: string;
  name: string;
  fetch: FetchLike;
}): Promise<VercelDeployResult> {
  const files = await staticEntriesForDeploy(options.sandboxRoot);
  if (files.bytes > VERCEL_INLINE_LIMIT) {
    throw vercelSizeLimitError(files.bytes);
  }

  const name = sanitizeDeploymentName(options.name) || "authenik8-site";
  const token = options.token.trim();
  let response: Response;
  try {
    response = await options.fetch(
      "https://api.vercel.com/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          target: "production",
          files: files.entries.map((entry) => ({
            file: entry.name,
            data: entry.data.toString("base64"),
            encoding: "base64",
          })),
          projectSettings: { framework: null },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch {
    throw new IntegrationError(502, "Could not reach Vercel. Check your network and try again.", "provider_unreachable");
  }

  const body = await readJsonObject(response);
  if (!response.ok) throw providerFailure("Vercel", response, body, [token]);
  const deploymentId = typeof body?.id === "string" ? body.id : "";
  if (deploymentId === "") {
    throw new IntegrationError(502, "Vercel did not return a deployment id.", "provider_response");
  }
  let state = typeof body?.readyState === "string" ? body.readyState : "UNKNOWN";
  let url = publicUrl(body?.url);

  const final = await pollVercelDeployment(options.fetch, token, deploymentId, state, url);

  return {
    provider: "vercel",
    deploymentId,
    url: final.url,
    state: final.state,
    files: files.entries.length,
    bytes: files.bytes,
  };
}

// ---------- Netlify ----------

export type NetlifyDeployResult = {
  provider: "netlify";
  siteId: string;
  siteUrl: string | null;
  deploymentId: string;
  url: string | null;
  state: string;
  files: number;
  bytes: number;
};

const NETLIFY_ZIP_LIMIT = 20 * 1024 * 1024;

type NetlifySiteRef = { siteId: string; siteUrl: string | null };

async function createNetlifySite(fetchImpl: FetchLike, token: string, name: string): Promise<NetlifySiteRef> {
  const siteName = sanitizeDeploymentName(name);
  const createBody: Record<string, string> = {};
  if (siteName !== "") createBody.name = siteName;
  let createResponse: Response;
  try {
    createResponse = await fetchImpl("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new IntegrationError(502, "Could not reach Netlify. Check your network and try again.", "provider_unreachable");
  }
  const createData = await readJsonObject(createResponse);
  if (!createResponse.ok) throw providerFailure("Netlify", createResponse, createData, [token]);
  const siteId = typeof createData?.id === "string" ? createData.id : "";
  if (siteId === "") {
    throw new IntegrationError(502, "Netlify did not return a site id.", "provider_response");
  }
  const siteUrl = publicUrl(createData?.ssl_url) ?? publicUrl(createData?.url);
  return { siteId, siteUrl };
}

type NetlifyDeployRef = { deploymentId: string; state: string; url: string | null };

async function uploadNetlifyDeploy(
  fetchImpl: FetchLike,
  token: string,
  siteId: string,
  zip: Buffer,
  siteUrl: string | null,
): Promise<NetlifyDeployRef> {
  let deployResponse: Response;
  try {
    deployResponse = await fetchImpl(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/zip",
        },
        body: zip,
        signal: AbortSignal.timeout(90_000),
      },
    );
  } catch {
    throw new IntegrationError(502, "Could not reach Netlify to upload the site. Check your network and try again.", "provider_unreachable");
  }

  const deployData = await readJsonObject(deployResponse);
  if (!deployResponse.ok) throw providerFailure("Netlify", deployResponse, deployData, [token]);
  const deploymentId = typeof deployData?.id === "string"
    ? deployData.id
    : typeof deployData?.deploy_id === "string"
      ? deployData.deploy_id
      : "";
  if (deploymentId === "") {
    throw new IntegrationError(502, "Netlify did not return a deploy id.", "provider_response");
  }
  const state = typeof deployData?.state === "string" ? deployData.state : "unknown";
  const url = publicUrl(deployData?.ssl_url)
    ?? publicUrl(deployData?.deploy_ssl_url)
    ?? publicUrl(deployData?.deploy_url)
    ?? siteUrl;
  return { deploymentId, state, url };
}

async function waitForNetlifyDeploy(
  fetchImpl: FetchLike,
  token: string,
  deploymentId: string,
  initialState: string,
  initialUrl: string | null,
): Promise<NetlifyDeployRef> {
  let state = initialState;
  let url = initialUrl;
  for (let attempt = 0; attempt < 10 && state !== "ready" && state !== "error"; attempt++) {
    await delay(1_000);
    try {
      const statusResponse = await fetchImpl(
        `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deploymentId)}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!statusResponse.ok) break;
      const statusBody = await readJsonObject(statusResponse);
      if (typeof statusBody?.state === "string") state = statusBody.state;
      url = publicUrl(statusBody?.ssl_url)
        ?? publicUrl(statusBody?.deploy_ssl_url)
        ?? publicUrl(statusBody?.deploy_url)
        ?? url;
    } catch {
      break;
    }
  }
  return { deploymentId, state, url };
}

/**
 * Create (or reuse) a Netlify site and deploy a ZIP of the static sandbox.
 * Netlify accepts the ZIP as the raw request body and reports the deploy state
 * through its deploy endpoint.
 */
export async function deployStaticToNetlify(options: {
  sandboxRoot: string;
  token: string;
  name: string;
  siteId: string;
  fetch: FetchLike;
}): Promise<NetlifyDeployResult> {
  const files = await staticEntriesForDeploy(options.sandboxRoot);
  const zip = createZip(files.entries);
  if (zip.length > NETLIFY_ZIP_LIMIT) {
    throw new IntegrationError(
      422,
      `This static site is ${formatBytes(zip.length)} compressed. Netlify ZIP deploys from the Studio are capped at ${formatBytes(NETLIFY_ZIP_LIMIT)}.`,
      "site_too_large",
    );
  }

  const token = options.token.trim();
  const siteRef: NetlifySiteRef = options.siteId.trim() === ""
    ? await createNetlifySite(options.fetch, token, options.name)
    : { siteId: options.siteId.trim(), siteUrl: null };

  const deployRef = await uploadNetlifyDeploy(options.fetch, token, siteRef.siteId, zip, siteRef.siteUrl);
  const status = await waitForNetlifyDeploy(options.fetch, token, deployRef.deploymentId, deployRef.state, deployRef.url);

  return {
    provider: "netlify",
    siteId: siteRef.siteId,
    siteUrl: siteRef.siteUrl,
    deploymentId: deployRef.deploymentId,
    url: status.url,
    state: status.state,
    files: files.entries.length,
    bytes: zip.length,
  };
}
