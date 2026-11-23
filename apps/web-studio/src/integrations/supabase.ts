import { IntegrationError, type FetchLike } from "./errors.js";

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

/** The refusal reason for a key that must never be sent to the project. */
function supabaseKeyError(info: SupabaseKeyInfo): IntegrationError | null {
  if (info.kind === "secret") {
    return new IntegrationError(
      400,
      "That is a secret key. Use the anon or publishable key here. Secret keys never go in this field.",
      "supabase_secret_key",
    );
  }
  if (info.kind === "invalid") {
    return new IntegrationError(400, "That Supabase key is not a valid anon or publishable key.", "supabase_invalid_key");
  }
  if (info.kind === "unknown") {
    return new IntegrationError(
      400,
      "That key is not an anon or publishable key. Use the public project key, never a user access token.",
      "supabase_unknown_key",
    );
  }
  return null;
}

/** Map a REST response to the refusal that explains it. */
function supabaseResponseError(response: Response): IntegrationError | null {
  if (response.status === 401 || response.status === 403) {
    return new IntegrationError(
      422,
      "Supabase rejected that key for this project. Check the anon or publishable key.",
      "supabase_key_rejected",
    );
  }
  if (response.status >= 300 && response.status < 400) {
    return new IntegrationError(
      422,
      "That URL redirected. Use the project URL directly, without a path.",
      "supabase_redirect",
    );
  }
  if (!response.ok) {
    return new IntegrationError(
      502,
      `Supabase REST returned HTTP ${response.status}. Check the project URL and try again.`,
      "supabase_http_error",
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return new IntegrationError(
      422,
      "That URL answered, but it was not a Supabase REST endpoint. Use the project URL, for example https://abcd.supabase.co.",
      "supabase_not_rest",
    );
  }
  return null;
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
  if (info.kind === "secret" || info.kind === "invalid" || info.kind === "unknown") {
    throw supabaseKeyError(info)!;
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
  const responseError = supabaseResponseError(response);
  if (responseError !== null) throw responseError;
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
  } else if (parsed.hostname === "pooler.supabase.com" || parsed.hostname.endsWith(".pooler.supabase.com")) {
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
