import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AgentRuntime } from "@authenik8/agent-adapter";

import { createWebStudioServer, type WebStudioDeps } from "../src/server.js";
import { mergeEnv, parseDatabaseUrl, supabaseKeyInfo } from "../src/integrations.js";

const VERCEL_TOKEN = "vercel-token-must-never-leak";
const NETLIFY_TOKEN = "netlify-token-must-never-leak";

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.test-signature`;
}

const ANON_KEY = jwt({ role: "anon", ref: "demo" });
const PROJECT_URL = "https://demo.supabase.co";

type CapturedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
};

let sandbox: string;
let requests: CapturedRequest[] = [];
let outbound: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const fakeRuntime: AgentRuntime = {
  id: "opencode",
  run: async () => ({
    ok: true,
    runtime: "opencode",
    command: [],
    exitCode: 0,
    timedOut: false,
    durationMs: 0,
    stdout: "",
    stderr: "",
    errorCode: null,
    sessionId: null,
  }),
};

const deps: WebStudioDeps = {
  gatewayFor: () => ({
    listModels: async () => [],
    chatStream: () => (async function* () {})(),
  }),
  sandboxRoot: "",
  agentRuntime: fakeRuntime,
  createRunner: () => ({
    start: () => true,
    stop: () => {},
    isRunning: () => false,
  }),
  integrationFetch: (input, init) => outbound(input, init),
};

const server = createWebStudioServer(deps);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "a8-studio-integrations-"));
  deps.sandboxRoot = sandbox;
});

beforeEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
  await mkdir(sandbox, { recursive: true });
  requests = [];
  outbound = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return jsonResponse({});
  };
});

afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});
});

async function post(route: string, body: unknown): Promise<Response> {
  return fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Parse the Vercel/Netlify SSE deploy stream into its final events. */
async function readDeployStream(res: Response): Promise<{ deployment?: Record<string, unknown>; error?: string; status: number }> {
  const reader = res.body?.getReader();
  if (reader === undefined) return { status: res.status };
  const decoder = new TextDecoder();
  let buffer = "";
  let deployment: Record<string, unknown> | undefined;
  let error: string | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of rawEvent.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (event.deployment !== undefined) deployment = event.deployment as Record<string, unknown>;
        if (event.error !== undefined) error = String(event.error);
      }
    }
  }
  return { deployment, error, status: res.status };
}

async function readEnv(): Promise<string> {
  return readFile(path.join(sandbox, ".env"), "utf8");
}

async function seedStaticSite(): Promise<void> {
  await writeFile(path.join(sandbox, "index.html"), "<!doctype html><h1>Hello</h1>\n", "utf8");
  await writeFile(path.join(sandbox, "style.css"), "h1 { color: green; }\n", "utf8");
  await writeFile(path.join(sandbox, "notes.txt"), "notes\n", "utf8");
  await writeFile(path.join(sandbox, "package.json"), '{ "name": "local" }\n', "utf8");
  await writeFile(path.join(sandbox, ".env"), "SECRET=must-not-deploy\n", "utf8");
  await mkdir(path.join(sandbox, "assets"), { recursive: true });
  await writeFile(path.join(sandbox, "assets", "logo.svg"), "<svg></svg>\n", "utf8");
  await mkdir(path.join(sandbox, "node_modules", "dep"), { recursive: true });
  await writeFile(path.join(sandbox, "node_modules", "dep", "index.js"), "dependency\n", "utf8");
}

describe("Supabase connection", () => {
  it("verifies the project URL and public key, applies nothing, and never echoes the key", async () => {
    outbound = async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      return jsonResponse({ openapi: "3.0.0" });
    };

    const res = await post("/api/integrations/supabase", {
      url: "demo.supabase.co",
      anonKey: ANON_KEY,
      apply: false,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      verified: true,
      applied: false,
      supabase: { url: PROJECT_URL, keyKind: "anon", projectRef: "demo" },
      database: null,
    });
    expect(JSON.stringify(body)).not.toContain(ANON_KEY);
    expect(existsSync(path.join(sandbox, ".env"))).toBe(false);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`${PROJECT_URL}/rest/v1/`);
    expect(requests[0]!.headers.get("apikey")).toBe(ANON_KEY);
    expect(requests[0]!.headers.get("authorization")).toBe(`Bearer ${ANON_KEY}`);
  });

  it("refuses a service-role secret before any network request", async () => {
    const secret = "sb_secret_do_not_use_in_browser";
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: secret,
      apply: true,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("supabase_secret_key");
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(requests).toHaveLength(0);
    expect(existsSync(path.join(sandbox, ".env"))).toBe(false);
  });

  it("refuses a legacy service_role JWT before any network request", async () => {
    const secret = jwt({ role: "service_role", ref: "demo" });
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: secret,
      apply: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("supabase_secret_key");
    expect(requests).toHaveLength(0);
    expect(existsSync(path.join(sandbox, ".env"))).toBe(false);
  });

  it("refuses a user access token before any network request", async () => {
    const userToken = jwt({ role: "authenticated", sub: "user-1" });
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: userToken,
      apply: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("supabase_unknown_key");
    expect(requests).toHaveLength(0);
    expect(existsSync(path.join(sandbox, ".env"))).toBe(false);
  });

  it("maps a rejected key to a clear error without echoing it", async () => {
    outbound = async () => jsonResponse({ message: "Invalid API key" }, 401);
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: ANON_KEY,
    });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).toContain("Supabase rejected that key");
    expect(text).not.toContain(ANON_KEY);
  });

  it("rejects a non-JSON endpoint so a wrong URL cannot look connected", async () => {
    outbound = async () => new Response("<html>hello</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: ANON_KEY,
    });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("supabase_not_rest");
  });

  it("saves a verified connection atomically, merges the env, and returns no secret values", async () => {
    outbound = async () => jsonResponse({ openapi: "3.0.0" });
    await writeFile(
      path.join(sandbox, ".env"),
      [
        "# keep this comment",
        "FOO=bar",
        "DATABASE_URL=postgresql://old:old@localhost:5432/old",
        "DATABASE_URL=postgresql://duplicate:duplicate@localhost:5432/old",
        "SUPABASE_URL=https://stale.supabase.co",
        "",
      ].join("\n"),
      "utf8",
    );

    const databaseUrl = "postgresql://postgres:supa%40pass@db.demo.supabase.co:5432/postgres?schema=public";
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      databaseUrl,
      apply: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      verified: true,
      applied: true,
      database: { host: "db.demo.supabase.co", port: "5432", database: "postgres" },
      status: { supabase: { configured: true, databaseConfigured: true, externalDatabase: true } },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(ANON_KEY);
    expect(serialized).not.toContain("supa%40pass");
    expect(serialized).not.toContain("postgresql://");

    const env = await readEnv();
    expect(env).toContain("# keep this comment");
    expect(env).toContain("FOO=bar");
    expect(env).toContain(`SUPABASE_URL=${PROJECT_URL}`);
    expect(env).toContain(`SUPABASE_ANON_KEY=${ANON_KEY}`);
    expect(env).toContain(`DATABASE_URL=${databaseUrl}`);
    expect(env).toContain("AUTHENIK8_LOCAL_DATABASE=external");
    expect(env).not.toContain("localhost:5432/old");
    expect(env.match(/^DATABASE_URL=/gm)).toHaveLength(1);
  });

  it("rejects a malformed database URL before verifying or writing anything", async () => {
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      databaseUrl: "mysql://root@localhost/app",
      apply: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("postgresql://");
    expect(requests).toHaveLength(0);
    expect(existsSync(path.join(sandbox, ".env"))).toBe(false);
  });

  it("reports configured state without returning the key or database URL", async () => {
    await writeFile(
      path.join(sandbox, ".env"),
      [
        `SUPABASE_URL=${PROJECT_URL}`,
        `SUPABASE_ANON_KEY=${ANON_KEY}`,
        "DATABASE_URL=postgresql://postgres:secret@db.demo.supabase.co:5432/postgres",
        "AUTHENIK8_LOCAL_DATABASE=external",
        "",
      ].join("\n"),
      "utf8",
    );
    const res = await fetch(`${base}/api/integrations`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.supabase).toMatchObject({
      configured: true,
      url: PROJECT_URL,
      keyKind: "anon",
      databaseConfigured: true,
      databaseHost: "db.demo.supabase.co",
      databaseName: "postgres",
      externalDatabase: true,
    });
    expect(JSON.stringify(body)).not.toContain(ANON_KEY);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("Supabase key classification", () => {
  it("keeps publishable and anon keys and marks service-role values secret", () => {
    expect(supabaseKeyInfo("sb_publishable_demo_key")).toEqual({ kind: "publishable", ref: null });
    expect(supabaseKeyInfo(jwt({ role: "anon", ref: "demo" }))).toEqual({ kind: "anon", ref: "demo" });
    expect(supabaseKeyInfo(jwt({ role: "service_role", ref: "demo" })).kind).toBe("secret");
    expect(supabaseKeyInfo(jwt({ role: "authenticated", sub: "user-1" })).kind).toBe("unknown");
    expect(supabaseKeyInfo("sb_secret_demo").kind).toBe("secret");
    expect(supabaseKeyInfo("not a key").kind).toBe("invalid");
  });
});

describe("env merge", () => {
  it("preserves comments, CRLF, and unrelated keys while replacing duplicates", () => {
    const result = mergeEnv(
      "A=1\r\n# note\r\nDATABASE_URL=old\r\nDATABASE_URL=older\r\nB=2\r\n",
      { DATABASE_URL: "postgresql://new", SUPABASE_URL: "https://demo.supabase.co" },
    );
    expect(result.replaced).toEqual(["DATABASE_URL"]);
    expect(result.added).toEqual(["SUPABASE_URL"]);
    expect(result.content.includes("\r\n")).toBe(true);
    expect(result.content).toContain("A=1");
    expect(result.content).toContain("# note");
    expect(result.content).toContain("B=2");
    expect(result.content.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(result.content).toContain("DATABASE_URL=postgresql://new");
    expect(result.content).toContain("SUPABASE_URL=https://demo.supabase.co");
  });

  it("quotes values that would otherwise start a dotenv comment", () => {
    const result = mergeEnv("", { DATABASE_URL: "postgresql://user:p#ss@host/db" });
    expect(result.content).toContain('DATABASE_URL="postgresql://user:p#ss@host/db"');
  });

  it("refuses a value that would inject another env line", () => {
    expect(() => mergeEnv("", { SUPABASE_URL: "https://demo.supabase.co\nADMIN=1" })).toThrow(
      "line break",
    );
  });
});

describe("database URL inspection", () => {
  it("never exposes credentials in the returned metadata", () => {
    const target = parseDatabaseUrl("postgresql://postgres:top-secret@db.demo.supabase.co:5432/postgres");
    expect(target).toMatchObject({ host: "db.demo.supabase.co", port: "5432", database: "postgres" });
    expect(JSON.stringify({ ...target, url: undefined })).not.toContain("top-secret");
  });

  it("warns about the transaction pooler without rejecting it", () => {
    const target = parseDatabaseUrl("postgresql://postgres:pw@db.demo.supabase.co:6543/postgres");
    expect(target.notes.join(" ")).toContain("5432");
  });

  it("turns a malformed escape into a validation error, not a crash", async () => {
    expect(() => parseDatabaseUrl("postgresql://postgres:pw@db.demo.supabase.co:5432/%zz")).toThrow(
      "invalid escape sequence",
    );
    const res = await post("/api/integrations/supabase", {
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      databaseUrl: "postgresql://postgres:pw@db.demo.supabase.co:5432/%zz",
      apply: true,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("invalid escape sequence");
    expect(requests).toHaveLength(0);
  });
});

describe("Vercel static deploy", () => {
  it("uploads only servable files and returns the deployment URL without the token", async () => {
    await seedStaticSite();
    outbound = async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      return jsonResponse({ id: "dpl_test", url: "demo-abc.vercel.app", readyState: "READY" });
    };

    const res = await post("/api/deploy/vercel", { token: VERCEL_TOKEN, name: "My Demo!" });
    expect(res.status).toBe(200);
    const stream = await readDeployStream(res);
    expect(stream.deployment).toMatchObject({
      provider: "vercel",
      deploymentId: "dpl_test",
      url: "https://demo-abc.vercel.app",
      state: "READY",
      files: 4,
      verified: true,
    });
    expect(JSON.stringify(stream.deployment)).not.toContain(VERCEL_TOKEN);

    // One deploy POST + one verification GET to the deployed URL.
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toBe("https://api.vercel.com/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1");
    expect(requests[0]!.headers.get("authorization")).toBe(`Bearer ${VERCEL_TOKEN}`);
    const payload = JSON.parse(String(requests[0]!.body)) as {
      name: string;
      target: string;
      projectSettings: { framework: null };
      files: Array<{ file: string; data: string; encoding: string }>;
    };
    expect(payload.name).toBe("my-demo");
    expect(payload.target).toBe("production");
    expect(payload.projectSettings.framework).toBeNull();
    expect(payload.files.map((file) => file.file)).toEqual([
      "assets/logo.svg",
      "index.html",
      "notes.txt",
      "style.css",
    ]);
    const index = payload.files.find((file) => file.file === "index.html");
    expect(index).toMatchObject({ encoding: "base64" });
    expect(Buffer.from(index!.data, "base64").toString("utf8")).toContain("Hello");
  });

  it("refuses a fullstack project before calling the provider", async () => {
    await seedStaticSite();
    await mkdir(path.join(sandbox, "apps", "api"), { recursive: true });
    const res = await post("/api/deploy/vercel", { token: VERCEL_TOKEN, name: "demo" });
    const stream = await readDeployStream(res);
    expect(stream.error).toContain("Express");
    expect(requests).toHaveLength(0);
  });

  it("maps a rejected token without echoing it", async () => {
    await seedStaticSite();
    outbound = async () => jsonResponse({ error: { message: "Not authorized" } }, 401);
    const res = await post("/api/deploy/vercel", { token: VERCEL_TOKEN, name: "demo" });
    const stream = await readDeployStream(res);
    expect(stream.error).toContain("Vercel rejected the access token");
    expect(stream.error).not.toContain(VERCEL_TOKEN);
  });
});

describe("Netlify static deploy", () => {
  it("creates a site, uploads a ZIP, and returns the site id", async () => {
    await seedStaticSite();
    outbound = async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      if (requests.length === 1) {
        return jsonResponse({ id: "site_1", ssl_url: "https://demo.netlify.app" });
      }
      return jsonResponse({ id: "dep_1", state: "ready", ssl_url: "https://demo.netlify.app" });
    };

    const res = await post("/api/deploy/netlify", { token: NETLIFY_TOKEN, name: "Demo Site" });
    expect(res.status).toBe(200);
    const stream = await readDeployStream(res);
    expect(stream.deployment).toMatchObject({
      provider: "netlify",
      siteId: "site_1",
      deploymentId: "dep_1",
      url: "https://demo.netlify.app",
      state: "ready",
      files: 4,
      verified: true,
    });
    expect(JSON.stringify(stream.deployment)).not.toContain(NETLIFY_TOKEN);

    // Site create, ZIP upload, and a verification GET to the deployed URL.
    expect(requests).toHaveLength(3);
    expect(requests[0]!.url).toBe("https://api.netlify.com/api/v1/sites");
    expect(JSON.parse(String(requests[0]!.body))).toEqual({ name: "demo-site" });
    expect(requests[1]!.url).toBe("https://api.netlify.com/api/v1/sites/site_1/deploys");
    expect(requests[1]!.headers.get("content-type")).toBe("application/zip");
    const zip = requests[1]!.body as Uint8Array;
    expect(Buffer.from(zip.subarray(0, 4)).toString("binary")).toBe("PK\u0003\u0004");
  });

  it("reuses an existing site id without creating another site", async () => {
    await seedStaticSite();
    outbound = async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      return jsonResponse({ id: "dep_2", state: "ready", ssl_url: "https://demo.netlify.app" });
    };
    const res = await post("/api/deploy/netlify", {
      token: NETLIFY_TOKEN,
      name: "ignored",
      siteId: "site_9",
    });
    expect(res.status).toBe(200);
    const stream = await readDeployStream(res);
    expect(stream.deployment).toMatchObject({ siteId: "site_9" });
    // Upload + verification GET.
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toBe("https://api.netlify.com/api/v1/sites/site_9/deploys");
  });

  it("surfaces a provider rejection without the token", async () => {
    await seedStaticSite();
    outbound = async () => jsonResponse({ message: "A site with this name already exists" }, 422);
    const res = await post("/api/deploy/netlify", { token: NETLIFY_TOKEN, name: "demo" });
    const stream = await readDeployStream(res);
    expect(stream.error).toContain("A site with this name already exists");
    expect(stream.error).not.toContain(NETLIFY_TOKEN);
  });
});
