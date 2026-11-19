import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createZip, type ZipEntry } from "./zip.js";

/**
 * User-triggered outbound integrations for the local studio.
 *
 * Trust boundary:
 * - tokens and keys arrive per request, are used for one provider call, and
 *   are never written to disk, logged, or echoed back;
 * - Supabase is a managed Postgres, Storage, and Realtime target only. It is
 *   never an identity authority: Authenik8 keeps users, sessions, OAuth,
 *   CSRF, roles, and authorization;
 * - only the public anon/publishable Supabase key is accepted for browser-safe
 *   configuration. Secret/service-role keys are refused before any request;
 * - deploys are static only, because a static host cannot run the generated
 *   Express API. Fullstack projects get an explicit handoff instead of a
 *   deploy that would break auth;
 * - `.env` writes are atomic, preserve unrelated lines, and never leave the
 *   sandbox (export, preview, and deploy collection all skip dotfiles).
 */

export type FetchLike = typeof fetch;

export class IntegrationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "integration_error") {
    super(message);
    this.name = "IntegrationError";
    this.status = status;
    this.code = code;
  }
}

// ---------- Supabase ----------

export type SupabaseKeyKind = "publishable" | "anon";
export type SupabaseKeyInfo = {
  kind: SupabaseKeyKind | "unknown" | "secret" | "invalid";
  ref: string | null;
};

export type SupabaseTarget = {
  url: string;
  keyKind: SupabaseKeyKind;
  projectRef: string | null;
};

export type DatabaseTarget = {
  /** Full connection string. Never returned by a route or written to a log. */
  url: string;
  host: string;
  port: string;
  database: string;
  notes: string[];
};

const SUPABASE_URL_MAX = 300;
const SUPABASE_KEY_MAX = 4096;
const DATABASE_URL_MAX = 4096;
const REST_TIMEOUT_MS = 15_000;
const VERCEL_INLINE_LIMIT = 3 * 1024 * 1024;
const NETLIFY_ZIP_LIMIT = 20 * 1024 * 1024;
const DEPLOY_FILE_LIMIT = 2_000;
const DEPLOY_DEPTH_LIMIT = 10;
const PROVIDER_MESSAGE_MAX = 300;

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || host === "[::1]";
}

/**
 * Normalize a Supabase project URL. A missing scheme gets https; plain http is
 * allowed only for a local Supabase stack. Paths, credentials, queries, and
 * fragments are refused so the verification call cannot be redirected to an
 * arbitrary endpoint.
 */
export function normalizeSupabaseUrl(value: string): string {
  const raw = value.trim();
  if (raw.length === 0) {
    throw new IntegrationError(400, "Enter the Supabase project URL.");
  }
  if (raw.length > SUPABASE_URL_MAX) {
    throw new IntegrationError(400, "That Supabase URL is too long.");
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new IntegrationError(400, "That does not look like a Supabase URL. Use the project URL, for example https://abcd.supabase.co.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new IntegrationError(400, "The Supabase URL must use https.");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new IntegrationError(400, "Remove the username or password from the Supabase URL.");
  }
  if ((parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search !== "" || parsed.hash !== "") {
    throw new IntegrationError(400, "Use the project origin only, without a path, query, or fragment.");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new IntegrationError(400, "Use https for a hosted Supabase project. Plain http is allowed only for localhost.");
  }
  return parsed.origin;
}

function decodeJwtPayload(segment: string): Record<string, unknown> | null {
  if (segment.length === 0 || segment.length > 8_192) return null;
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Classify a Supabase key without verifying its signature. The role claim is
 * used only to keep a service-role secret out of the public slot; the REST
 * check below is the actual validity test.
 */
export function supabaseKeyInfo(value: string): SupabaseKeyInfo {
  const key = value.trim();
  if (key.length < 8 || key.length > SUPABASE_KEY_MAX || /[\s"']/u.test(key)) {
    return { kind: "invalid", ref: null };
  }
  if (key.startsWith("sb_secret_")) return { kind: "secret", ref: null };
  if (key.startsWith("sb_publishable_")) return { kind: "publishable", ref: null };
  const parts = key.split(".");
  if (parts.length === 3) {
    const payload = decodeJwtPayload(parts[1] ?? "");
    if (payload !== null) {
      const role = typeof payload.role === "string" ? payload.role : "";
      const ref = typeof payload.ref === "string" ? payload.ref : null;
      if (role === "service_role") return { kind: "secret", ref };
      if (role === "anon") return { kind: "anon", ref };
      return { kind: "unknown", ref };
    }
  }
  return { kind: "unknown", ref: null };
}

function projectRefFromHost(hostname: string): string | null {
  const suffix = ".supabase.co";
  if (!hostname.toLowerCase().endsWith(suffix)) return null;
  const ref = hostname.slice(0, -suffix.length);
  return /^[a-z0-9-]{3,80}$/i.test(ref) ? ref : null;
}

/**
 * Verify the URL and public key against the project's REST root. A 200 JSON
 * response proves the endpoint exists and the key is accepted. The request is
 * never followed through a redirect, and a service-role key is refused before
 * it is sent anywhere.
 */
export async function verifySupabase(options: {
  url: string;
  key: string;
  fetch: FetchLike;
}): Promise<SupabaseTarget> {
  const info = supabaseKeyInfo(options.key);
  if (info.kind === "secret") {
    throw new IntegrationError(
      400,
      "That is a secret key. Use the anon or publishable key here. Secret keys never go in this field.",
      "supabase_secret_key",
    );
  }
  if (info.kind === "invalid") {
    throw new IntegrationError(400, "That Supabase key is not a valid anon or publishable key.", "supabase_invalid_key");
  }
  if (info.kind === "unknown") {
    throw new IntegrationError(
      400,
      "That key is not an anon or publishable key. Use the public project key, never a user access token.",
      "supabase_unknown_key",
    );
  }
  const origin = normalizeSupabaseUrl(options.url);
  let response: Response;
  try {
    response = await options.fetch(`${origin}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: options.key.trim(),
        authorization: `Bearer ${options.key.trim()}`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch {
    throw new IntegrationError(
      502,
      `Could not reach ${origin}. Check the URL and your network, then try again.`,
      "supabase_unreachable",
    );
  }
  try {
    await response.body?.cancel();
  } catch {
    // The status and content type are all this check needs.
  }
  if (response.status === 401 || response.status === 403) {
    throw new IntegrationError(
      422,
      "Supabase rejected that key for this project. Check the anon or publishable key.",
      "supabase_key_rejected",
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new IntegrationError(
      422,
      "That URL redirected. Use the project URL directly, without a path.",
      "supabase_redirect",
    );
  }
  if (!response.ok) {
    throw new IntegrationError(
      502,
      `Supabase REST returned HTTP ${response.status}. Check the project URL and try again.`,
      "supabase_http_error",
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new IntegrationError(
      422,
      "That URL answered, but it was not a Supabase REST endpoint. Use the project URL, for example https://abcd.supabase.co.",
      "supabase_not_rest",
    );
  }
  return {
    url: origin,
    keyKind: info.kind,
    projectRef: info.ref ?? projectRefFromHost(new URL(origin).hostname),
  };
}

/** Validate a Postgres URL without connecting or echoing its password. */
export function parseDatabaseUrl(value: string): DatabaseTarget {
  const raw = value.trim();
  if (raw.length === 0) {
    throw new IntegrationError(400, "Enter the Supabase database connection string.");
  }
  if (raw.length > DATABASE_URL_MAX || /[\r\n]/u.test(raw)) {
    throw new IntegrationError(400, "That database connection string is not valid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new IntegrationError(400, "That database connection string is not a valid URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new IntegrationError(400, "The database URL must start with postgresql://.");
  }
  if (parsed.hostname.length === 0) {
    throw new IntegrationError(400, "The database URL is missing a host.");
  }
  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new IntegrationError(400, "The database URL contains an invalid escape sequence.");
  }
  if (database.length === 0) {
    throw new IntegrationError(400, "The database URL is missing a database name.");
  }
  const port = parsed.port === "" ? "5432" : parsed.port;
  const notes: string[] = [];
  if (port === "6543") {
    notes.push("Port 6543 is the transaction pooler. Prisma migrations need the direct or session connection on port 5432; use that string for setup and migrations.");
  } else if (parsed.hostname.includes("pooler.supabase.com")) {
    notes.push("This is a Supabase pooler host. If migrations fail, use the direct connection string on port 5432.");
  }
  if ((parsed.searchParams.get("pgbouncer") ?? "").toLowerCase() === "true") {
    notes.push("pgbouncer=true is set. Prisma schema pushes and migrations may need a direct connection.");
  }
  return {
    url: raw,
    host: parsed.hostname,
    port,
    database,
    notes,
  };
}

// ---------- env merge ----------

const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/;
const SAFE_ENV_VALUE = /^[A-Za-z0-9_@%+=:,./~?&-]+$/;

function quoteEnvValue(value: string): string {
  if (/[\r\n]/u.test(value)) {
    throw new IntegrationError(500, "An environment value contained a line break.", "env_value_invalid");
  }
  if (value.length > 0 && SAFE_ENV_VALUE.test(value) && !value.startsWith("#")) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type EnvMergeResult = {
  content: string;
  replaced: string[];
  added: string[];
};

/**
 * Merge managed values into a dotenv file. Existing keys are replaced in
 * place, duplicate managed keys are collapsed, unrelated lines and comments
 * are preserved, and the file's newline style is kept.
 */
export function mergeEnv(
  existing: string,
  values: Readonly<Record<string, string>>,
): EnvMergeResult {
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = /\r?\n$/.test(existing);
  const lines = existing === "" ? [] : existing.split(/\r?\n/);
  if (hadTrailingNewline) lines.pop();

  const keys = Object.keys(values);
  const replaced = new Set<string>();
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of lines) {
    const match = ENV_LINE.exec(line);
    const key = match?.[1];
    if (key !== undefined && Object.hasOwn(values, key)) {
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(`${key}=${quoteEnvValue(values[key] ?? "")}`);
      replaced.add(key);
      continue;
    }
    output.push(line);
  }

  const added = keys.filter((key) => !seen.has(key));
  if (added.length > 0) {
    while (output.length > 0 && output[output.length - 1]?.trim() === "") output.pop();
    if (output.length > 0) output.push("");
    if (!existing.includes("Authenik8 integrations")) {
      output.push("# Authenik8 integrations (written by Studio; never commit this file)");
    }
    for (const key of added) {
      output.push(`${key}=${quoteEnvValue(values[key] ?? "")}`);
    }
  }

  return {
    content: `${output.join(newline)}${newline}`,
    replaced: keys.filter((key) => replaced.has(key)),
    added,
  };
}

export type EnvWriteResult = {
  path: string;
  keys: string[];
  replaced: string[];
  added: string[];
};

export async function writeProjectEnv(
  sandboxRoot: string,
  values: Readonly<Record<string, string>>,
): Promise<EnvWriteResult> {
  await mkdir(sandboxRoot, { recursive: true });
  const envPath = path.join(sandboxRoot, ".env");
  const existing = await readFile(envPath, "utf8").catch(() => "");
  const merged = mergeEnv(existing, values);
  const temp = path.join(sandboxRoot, `.env.studio-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temp, merged.content, { encoding: "utf8", mode: 0o600 });
  await rename(temp, envPath);
  return {
    path: envPath,
    keys: Object.keys(values),
    replaced: merged.replaced,
    added: merged.added,
  };
}

function envMap(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);
    if (match === null) continue;
    const key = match[1];
    if (key === undefined) continue;
    let value = line.slice(match[0].length).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

// ---------- project profile ----------

export type ProjectKind = "static" | "fullstack" | "server" | "empty";

export type ProjectProfile = {
  kind: ProjectKind;
  rootIndex: boolean;
};

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export async function projectProfile(sandboxRoot: string): Promise<ProjectProfile> {
  const rootIndex = await isFile(path.join(sandboxRoot, "index.html"));
  if (await isDirectory(path.join(sandboxRoot, "apps", "api"))) {
    return { kind: "fullstack", rootIndex };
  }
  if (rootIndex) return { kind: "static", rootIndex: true };
  if (await isFile(path.join(sandboxRoot, "package.json"))) {
    return { kind: "server", rootIndex: false };
  }
  return { kind: "empty", rootIndex: false };
}

export type IntegrationStatus = {
  supabase: {
    configured: boolean;
    url: string | null;
    keyKind: SupabaseKeyKind | null;
    databaseConfigured: boolean;
    databaseHost: string | null;
    databaseName: string | null;
    externalDatabase: boolean;
  };
  project: ProjectProfile;
};

export async function readIntegrationStatus(sandboxRoot: string): Promise<IntegrationStatus> {
  const raw = await readFile(path.join(sandboxRoot, ".env"), "utf8").catch(() => "");
  const env = envMap(raw);
  const configuredUrl = env.get("SUPABASE_URL") ?? "";
  let url: string | null = null;
  if (configuredUrl !== "") {
    try {
      url = normalizeSupabaseUrl(configuredUrl);
    } catch {
      url = null;
    }
  }
  const configuredKey = env.get("SUPABASE_ANON_KEY") ?? "";
  const keyInfo = configuredKey === "" ? null : supabaseKeyInfo(configuredKey);
  const keyKind = keyInfo !== null && (keyInfo.kind === "publishable" || keyInfo.kind === "anon")
    ? keyInfo.kind
    : null;
  let databaseHost: string | null = null;
  let databaseName: string | null = null;
  const configuredDatabase = env.get("DATABASE_URL") ?? "";
  if (configuredDatabase !== "") {
    try {
      const database = parseDatabaseUrl(configuredDatabase);
      databaseHost = database.host;
      databaseName = database.database;
    } catch {
      databaseHost = null;
      databaseName = null;
    }
  }
  return {
    supabase: {
      configured: url !== null && keyKind !== null,
      url,
      keyKind,
      databaseConfigured: databaseHost !== null,
      databaseHost,
      databaseName,
      externalDatabase: (env.get("AUTHENIK8_LOCAL_DATABASE") ?? "").toLowerCase() === "external",
    },
    project: await projectProfile(sandboxRoot),
  };
}

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
    throw new IntegrationError(
      422,
      `This static site is ${formatBytes(files.bytes)}. Vercel inline deploys are capped at ${formatBytes(VERCEL_INLINE_LIMIT)}. Use Netlify, or the Vercel CLI for a larger site.`,
      "site_too_large",
    );
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

  for (let attempt = 0; attempt < 8 && state !== "READY" && state !== "ERROR" && state !== "CANCELED"; attempt++) {
    await delay(1_000);
    try {
      const statusResponse = await options.fetch(
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

  return {
    provider: "vercel",
    deploymentId,
    url,
    state,
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
  let siteId = options.siteId.trim();
  let siteUrl: string | null = null;

  if (siteId === "") {
    const siteName = sanitizeDeploymentName(options.name);
    const createBody: Record<string, string> = {};
    if (siteName !== "") createBody.name = siteName;
    let createResponse: Response;
    try {
      createResponse = await options.fetch("https://api.netlify.com/api/v1/sites", {
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
    siteId = typeof createData?.id === "string" ? createData.id : "";
    if (siteId === "") {
      throw new IntegrationError(502, "Netlify did not return a site id.", "provider_response");
    }
    siteUrl = publicUrl(createData?.ssl_url) ?? publicUrl(createData?.url);
  }

  let deployResponse: Response;
  try {
    deployResponse = await options.fetch(
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
  let state = typeof deployData?.state === "string" ? deployData.state : "unknown";
  let url = publicUrl(deployData?.ssl_url)
    ?? publicUrl(deployData?.deploy_ssl_url)
    ?? publicUrl(deployData?.deploy_url)
    ?? siteUrl;

  for (let attempt = 0; attempt < 10 && state !== "ready" && state !== "error"; attempt++) {
    await delay(1_000);
    try {
      const statusResponse = await options.fetch(
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

  return {
    provider: "netlify",
    siteId,
    siteUrl,
    deploymentId,
    url,
    state,
    files: files.entries.length,
    bytes: zip.length,
  };
}
