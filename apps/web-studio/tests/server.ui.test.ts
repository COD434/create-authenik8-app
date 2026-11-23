import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { executeTool } from "../src/tools.js";
import {
  KEY,
  base,
  capturedKey,
  chat,
  runnerState,
  sandbox,
} from "./support/studio-harness.js";

describe("static UI and auth boundary", () => {
  it("rejects cross-origin requests before they can start, stop, or reset local work", async () => {
    const run = await fetch(`${base}/api/run`, {
      method: "POST",
      headers: { origin: "http://attacker.example" },
    });
    expect(run.status).toBe(403);
    expect(runnerState.started).toBe(0);

    const stop = await fetch(`${base}/api/run/stop`, {
      method: "POST",
      headers: { origin: "http://attacker.example" },
    });
    expect(stop.status).toBe(403);
    expect(runnerState.stopped).toBe(0);

    const reset = await fetch(`${base}/api/reset`, {
      method: "POST",
      headers: { origin: "http://attacker.example" },
    });
    expect(reset.status).toBe(403);

    const rebinding = await fetch(`${base}/api/reset`, {
      method: "POST",
      headers: { origin: "http://attacker.example", host: "attacker.example" },
    });
    expect(rebinding.status).toBe(403);

    const sameOrigin = await fetch(`${base}/api/run/stop`, {
      method: "POST",
      headers: { origin: base },
    });
    expect(sameOrigin.status).toBe(200);
    expect(runnerState.stopped).toBe(1);
  });

  it("serves the chat shell, never cacheable (a stale tab must not outlive a fix)", async () => {
    const res = await fetch(`${base}/studio`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const html = await res.text();
    expect(html).toContain("<title>Authenik8</title>");
    expect(html).toContain('id="plan-panel"');
    expect(html).toContain('id="plan-steps"');
    expect(html).toContain('id="subagents-btn"');
    expect(html).toContain('id="subagents-overlay"');
    expect(html).toContain("Newest 50 runs max.");
    expect(html).not.toContain('id="pricing-btn"');
    expect(html).not.toContain('id="pricing-overlay"');
    expect(html).toContain('id="template-pro-saas"');
    expect(html).toContain("SaaS starter");
    expect(html).toContain('id="template-demo"');
    expect(html).toContain('id="template-demo-row"');
    expect(html).toContain('id="template-actions"');
    expect(html).toContain('id="ship-btn"');
    expect(html).toContain('id="ship-overlay"');
    expect(html).toContain("Ship project");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="ship-tab-supabase"');
    expect(html).toContain('id="ship-tab-vercel"');
    expect(html).toContain('id="ship-tab-netlify"');
    expect(html).toContain("Connect &amp; Deploy Supabase");
    expect(html).toContain("Tokens and keys are never saved or logged.");

    // The shell is split into ordered classic scripts; join them so the
    // structural guards below stay about behavior, not file layout.
    const scriptPaths = [...html.matchAll(/<script src="([^"]+)"><\/script\s*>/gi)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);
    expect(scriptPaths.length).toBeGreaterThan(1);
    const appSource = (await Promise.all(
      scriptPaths.map(async (scriptPath) => {
        const appJs = await fetch(`${base}${scriptPath}`);
        expect(appJs.status).toBe(200);
        expect(appJs.headers.get("cache-control")).toContain("no-store");
        return appJs.text();
      }),
    )).join("\n");

    // Every shell module on disk must be loaded exactly once, in order.
    const publicDir = fileURLToPath(new URL("../public", import.meta.url));
    const shellScripts = (await readdir(publicDir))
      .filter((name) => name.startsWith("app-") && name.endsWith(".js"))
      .sort();
    const referencedScripts = scriptPaths
      .map((scriptPath) => scriptPath.replace("/studio/", ""))
      .filter((name) => name.startsWith("app-") && name.endsWith(".js"))
      .sort();
    expect(referencedScripts).toEqual(shellScripts);
    expect(appSource).toContain("/api/subagents");
    // Structural guard for the modal focus contract: background inert,
    // a shared Tab trap, opener restoration, and a visible error state with
    // focus kept on Back.
    expect(appSource).toContain("setModalBackgroundInert");
    expect(appSource).toContain("trapModalTab");
    expect(appSource).toContain("trapOpenModalTab");
    expect(appSource).toContain("restoreModalFocus");
    expect(appSource).toContain("openAgent");
    expect(appSource).toContain("openTemplate");
    expect(appSource).toContain("closeAgent");
    expect(appSource).toContain("closeTemplate");
    expect(appSource).toContain("agentDismiss.focus()");
    expect(appSource).toContain("templateDismiss.focus()");
    expect(appSource).toContain('subagentsMeta.textContent = "Unavailable"');
    expect(appSource).toContain("shortSubagentId");
    expect(appSource).toContain('"Task preview"');
    expect(appSource).toContain("openSubagentTranscriptFromTool");
    expect(appSource).toContain('"View transcript"');
    expect(appSource).toContain("childIdFromResult");
    expect(appSource).not.toContain("openPricing");
    expect(appSource).not.toContain("pricing-cta");
    expect(appSource).toContain("openShip");
    expect(appSource).toContain("closeShip");
    expect(appSource).toContain("clearShipSecrets");
    expect(appSource).toContain("/api/integrations");
    expect(appSource).toContain("/api/deploy/");
    expect(appSource).toContain('deployToProvider("vercel")');
    expect(appSource).toContain('deployToProvider("netlify")');
    expect(appSource).toContain("selectShipTab");
    expect(appSource).toContain("shipBusy");
    expect(appSource).toContain("templateProSaas");
    expect(appSource).toContain("templateDemo");
    expect(appSource).toContain("templateActions");
    expect(appSource).toContain("spec.demo");
    expect(appSource).toContain("spec.oauthProviders = [];");
    const style = await fetch(`${base}/studio/style.css`);
    expect(style.headers.get("cache-control")).toContain("no-store");
    const styleSource = await style.text();
    expect(styleSource).toContain(".tool-transcript-link");
    expect(styleSource).not.toContain(".pricing-grid");
    expect(styleSource).toContain(".template-pro");
    expect(styleSource).toContain(".template-modal");
    expect(styleSource).toContain(".template-body");
    expect(styleSource).toContain(".template-actions");
    expect(styleSource).toContain(".ship-modal");
    expect(styleSource).toContain(".ship-tabs");
    expect(styleSource).toContain(".ship-panel");
    // The real brand mark must serve same-origin: favicon, sidebar, hero,
    // and avatars all point at it (no CDNs, ever).
    const logo = await fetch(`${base}/studio/authenik8-logo.svg`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toContain("image/svg+xml");
    expect(logo.headers.get("cache-control")).toContain("no-store");
    // The trimmed mark fills the frame: it is what the sidebar, favicon,
    // and small surfaces use (the poster art dies at 36px).
    const mark = await fetch(`${base}/studio/authenik8-mark.svg`);
    expect(mark.status).toBe(200);
    expect(mark.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("browses free models with NO key, and still refuses chat without one", async () => {
    const models = await fetch(`${base}/api/models`);
    expect(models.status).toBe(200);
    const body = await models.json();
    // Paid and non-tool-capable models are filtered; the app-traffic auto-
    // router leads so the zero-click default is a working model.
    expect(body.models.map((m: { id: string }) => m.id)).toEqual(["openrouter/free", "free/model-a"]);

    const chatRes = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openrouter/free", message: "hi" }),
    });
    expect(chatRes.status).toBe(401);
    expect((await chatRes.json()).error).toContain("X-OpenRouter-Key");
    expect(capturedKey).toBeNull(); // a keyless request never builds a gateway
  });

  it("lists only free, tool-capable models and never echoes the key", async () => {
    const res = await fetch(`${base}/api/models`, { headers: { "X-OpenRouter-Key": KEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["openrouter/free", "free/model-a"]);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });
});


describe("routing hygiene", () => {
  it("404s unknown paths and 405s wrong API methods", async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/models`, { method: "POST" })).status).toBe(405);
  });

  it("does not serve arbitrary files outside the static map", async () => {
    const traversal = await fetch(`${base}/..%2F..%2Fpackage.json`);
    expect(traversal.status).toBe(404);
  });

  it("rejects malformed chat JSON with 400 instead of 500", async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "x-openrouter-key": "sk-test", "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
});

describe("preview route", () => {  it("serves sandbox files written by the tools with mapped types and nosniff", async () => {
    const write = await executeTool(
      "write_file",
      JSON.stringify({ path: "index.html", content: "<h1>hello preview</h1>" }),
      sandbox,
    );
    expect(write.ok).toBe(true);

    const home = await fetch(`${base}/preview`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    expect(home.headers.get("x-content-type-options")).toBe("nosniff");
    expect(home.headers.get("cache-control")).toBe("no-store");
    expect(await home.text()).toContain("hello preview");

    await executeTool(
      "write_file",
      JSON.stringify({ path: "assets/style.css", content: "h1 { color: red; }" }),
      sandbox,
    );
    const css = await fetch(`${base}/preview/assets/style.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");

    await executeTool("write_file", JSON.stringify({ path: "icon.png", content: "not really a png" }), sandbox);
    const png = await fetch(`${base}/preview/icon.png`);
    expect(png.headers.get("content-type")).toBe("image/png");
  });

  it("defaults directories to their index.html", async () => {
    await executeTool(
      "write_file",
      JSON.stringify({ path: "sub/index.html", content: "<p>sub page</p>" }),
      sandbox,
    );
    const res = await fetch(`${base}/preview/sub`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("sub page");
  });

  it("refuses traversal, dotfiles, and missing files with 404", async () => {
    // %2e%2e normalizes away in the URL parser; %252e%252e reaches the guard.
    expect((await fetch(`${base}/preview/%252e%252e/package.json`)).status).toBe(404);
    expect((await fetch(`${base}/preview/..%5Cpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/preview/.env`)).status).toBe(404);
    expect((await fetch(`${base}/preview/.git/config`)).status).toBe(404);
    expect((await fetch(`${base}/preview/nope.html`)).status).toBe(404);
  });

  it("405s non-GET preview requests", async () => {
    expect((await fetch(`${base}/preview/`, { method: "POST" })).status).toBe(405);
  });
});

