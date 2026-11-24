import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { executeTool } from "../src/tools.js";
import { createZip } from "../src/zip.js";
import {
  agentCalls,
  agentSuccess,
  base,
  capturedRequests,
  chat,
  deps,
  resolveRun,
  runnerState,
  sandbox,
  state,
  textRound,
} from "./support/studio-harness.js";

describe("build agent route", () => {
  function runAgent(prompt: string): Promise<Response> {
    return fetch(`${base}/api/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  }

  it("runs the agent in the sandbox with auto-approve and streams the outcome", async () => {
    const pending = runAgent("a barbershop booking app");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    expect(agentCalls[0]!.cwd).toBe(sandbox);
    expect(agentCalls[0]!.autoApprove).toBe(true);
    expect(agentCalls[0]!.prompt).toContain("a barbershop booking app");
    expect(agentCalls[0]!.prompt).toContain("Authenik8"); // doctrine preamble

    resolveRun(agentSuccess);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    expect(text).toContain('"phase":"start"');
    expect(text).toContain('"phase":"done"');
    expect(text).toContain('"ok":true');
    expect(text).toContain('"sessionId":"ses_abc"');
    expect(text).toContain("created project files");
  });

  it("relays live runtime events as data while the run is in flight", async () => {
    const pending = runAgent("build with live events");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    // Events emitted mid-run, before the final result resolves.
    agentCalls[0]!.onEvent?.({ index: 0, data: { type: "step", part: "start" } });
    agentCalls[0]!.onEvent?.({ index: 1, data: { type: "tool", name: "write_file" } });

    resolveRun(agentSuccess);
    const text = await (await pending).text();

    expect(text).toContain('"agentEvent"');
    expect(text).toContain('"type":"step"');
    expect(text).toContain('"name":"write_file"');
    expect(text).toContain('"phase":"done"'); // final result still streams
  });

  it("rejects a second agent run while one is in progress", async () => {
    const first = runAgent("first build");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    const second = await runAgent("second build");
    expect(second.status).toBe(409);

    resolveRun(agentSuccess);
    expect((await first).status).toBe(200);
  });

  it("streams agent failures as data with the structured error code", async () => {
    const pending = runAgent("build me something");
    await vi.waitFor(() => expect(agentCalls).toHaveLength(1));

    resolveRun({
      ...agentSuccess,
      ok: false,
      exitCode: null,
      errorCode: "runtime_missing",
      sessionId: null,
      stdout: "",
      stderr: "opencode executable not found",
    });
    const text = await (await pending).text();

    expect(text).toContain('"ok":false');
    expect(text).toContain('"errorCode":"runtime_missing"');
    expect(text).toContain("opencode executable not found");
  });

  it("rejects invalid bodies with 400 and never reaches the runtime", async () => {
    const res = await runAgent("");
    expect(res.status).toBe(400);
    expect(agentCalls).toHaveLength(0);
  });

  it("rejects malformed JSON with 400 instead of 500", async () => {
    const res = await fetch(`${base}/api/agent`, { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(agentCalls).toHaveLength(0);
  });

  it("bootstraps a missing sandbox directory before the runtime runs", async () => {
    const fresh = path.join(sandbox, "bootstrap-agent");
    deps.sandboxRoot = fresh;
    try {
      const pending = runAgent("bootstrap test");
      await vi.waitFor(() => expect(agentCalls).toHaveLength(1));
      // mkdir ran before the runtime call: the cwd is already real.
      expect(existsSync(agentCalls[0]!.cwd!)).toBe(true);
      resolveRun(agentSuccess);
      expect((await pending).status).toBe(200);
    } finally {
      deps.sandboxRoot = sandbox;
    }
  });
});

describe("template bridge route", () => {
  const validSeed = {
    preset: "auth",
    database: "sqlite",
    packageManager: "npm",
    usePrisma: true,
  };

  it("refuses to replace the sandbox without explicit confirmation", async () => {
    const res = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, confirm: false }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("replaces the entire sandbox");
  });

  it("keeps the CLI's fullstack matrix honest", async () => {
    const res = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, preset: "fullstack", frontend: "react", database: "sqlite", confirm: true }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("requires PostgreSQL");

    const needsFrontend = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, preset: "fullstack", database: "postgresql", confirm: true }),
    });
    expect(needsFrontend.status).toBe(422);
    expect((await needsFrontend.json()).error).toContain("needs a frontend");

    const strayFrontend = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, frontend: "react", confirm: true }),
    });
    expect(strayFrontend.status).toBe(422);
    expect((await strayFrontend.json()).error).toContain("fullstack preset");

    const strayDemo = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, demo: true, confirm: true }),
    });
    expect(strayDemo.status).toBe(422);
    expect((await strayDemo.json()).error).toContain("fullstack preset");
  });

  it("refuses while a run is active", async () => {
    runnerState.running = true;
    const res = await fetch(`${base}/api/template`, {
      method: "POST",
      body: JSON.stringify({ ...validSeed, confirm: true }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("running");
  });

  it("seeds through the bridge CLI and resets the chat context", async () => {
    // Prior sandbox state and a prior conversation turn must not survive.
    await writeFile(path.join(sandbox, "old-life.txt"), "junk", "utf8");
    const prior = await chat("build something for the old sandbox");
    await prior.text();

    const clone = await mkdtemp(path.join(tmpdir(), "a8-route-clone-"));
    try {
      await mkdir(path.join(clone, "dist"), { recursive: true });
      await writeFile(
        path.join(clone, "package.json"),
        JSON.stringify({ name: "create-authenik8-app", bin: { "create-authenik8-app": "dist/cli.js" } }),
        "utf8",
      );
      await writeFile(
        path.join(clone, "dist", "cli.js"),
        `import { mkdirSync, writeFileSync } from "node:fs";
const name = process.argv[2];
console.log("stub: generating", name);
mkdirSync(name, { recursive: true });
writeFileSync(name + "/authenik8.json", JSON.stringify({ schemaVersion: 1 }));
writeFileSync(name + "/package.json", JSON.stringify({ scripts: { start: "node server.js" } }));
writeFileSync(name + "/stub-argv.json", JSON.stringify(process.argv));
process.exit(0);
`,
        "utf8",
      );
      deps.bridge = { kind: "package", binPath: path.join(clone, "dist", "cli.js") };

      const res = await fetch(`${base}/api/template`, {
        method: "POST",
        body: JSON.stringify({ ...validSeed, confirm: true }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const text = await res.text();
      expect(text).toContain('"phase":"start"');
      expect(text).toContain("[out] stub: generating");
      expect(text).toContain('"phase":"seeded"');
      expect(text).toContain('"done":true');

      const names = await readdir(sandbox);
      expect(names).toContain("authenik8.json");
      expect(names).toContain("package.json");
      expect(names).not.toContain("old-life.txt");

      // The studio's argv contract reached the CLI untouched.
      const argv = JSON.parse(await readFile(path.join(sandbox, "stub-argv.json"), "utf8")) as string[];
      for (const guard of ["--no-git", "--no-install", "--yes"]) {
        expect(argv).toContain(guard);
      }
      await rm(path.join(sandbox, "stub-argv.json"), { force: true });

      // The conversation reset: the next model request carries a fresh runtime
      // context plus the user turn.
      state.script = [textRound];
      const afterSeed = await chat("fresh start");
      await afterSeed.text();
      expect(capturedRequests.at(-1)!.messages).toHaveLength(3);
    } finally {
      delete deps.bridge;
    }
  });
});

describe("export route", () => {
  it("downloads the sandbox as a ZIP, skipping node_modules and dotfiles", async () => {
    await executeTool("write_file", JSON.stringify({ path: "index.html", content: "<h1>ship it</h1>" }), sandbox);
    await executeTool("write_file", JSON.stringify({ path: ".env", content: "SECRET=1" }), sandbox);

    const res = await fetch(`${base}/api/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 4).toString("hex")).toBe("504b0304"); // ZIP local header
    expect(body.toString("latin1")).toContain("index.html");
    expect(body.toString("latin1")).not.toContain(".env");
  });

  it("bootstraps a missing sandbox and exports a valid empty ZIP on first run", async () => {
    // A first-run dev can click Export ZIP before anything was ever
    // generated: the sandbox does not exist yet. The export must not 500.
    const fresh = path.join(sandbox, "bootstrap-export");
    deps.sandboxRoot = fresh;
    try {
      const res = await fetch(`${base}/api/export`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");

      const body = Buffer.from(await res.arrayBuffer());
      expect(existsSync(fresh)).toBe(true); // sandbox was bootstrapped, not zip-crashed
      const eocd = body.subarray(body.length - 22);
      expect(eocd.subarray(0, 4).toString("hex")).toBe("504b0506"); // end of central directory
      expect(eocd.readUInt16LE(10)).toBe(0); // zero entries
      expect(eocd.readUInt16LE(12)).toBe(0);
    } finally {
      deps.sandboxRoot = sandbox;
      await rm(fresh, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe("import route", () => {
  function projectZip(files: Record<string, string>): Buffer {
    return createZip(Object.entries(files).map(([name, content]) => ({ name, data: Buffer.from(content) })));
  }

  function postImport(step: "preview" | "apply", archive: Buffer, replace = false): Promise<Response> {
    return fetch(`${base}/api/import/${step}${replace ? "?replace=true" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: archive,
    });
  }

  it("previews a ZIP, then preserves or replaces conflicts on confirmation", async () => {
    await executeTool("write_file", JSON.stringify({ path: "index.html", content: "old" }), sandbox);
    const archive = projectZip({ "index.html": "new", "about.html": "about" });

    const preview = await postImport("preview", archive);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      conflicts: 1,
      blocked: 0,
      skipped: 0,
      files: [
        { path: "index.html", bytes: 3, state: "conflict" },
        { path: "about.html", bytes: 5, state: "new" },
      ],
    });
    // Preview is read-only: the conflicting file is untouched until apply.
    expect(await readFile(path.join(sandbox, "index.html"), "utf8")).toBe("old");

    const kept = await postImport("apply", archive);
    expect(kept.status).toBe(200);
    expect(await kept.json()).toMatchObject({ ok: true, written: 1, preserved: 1 });
    expect(await readFile(path.join(sandbox, "index.html"), "utf8")).toBe("old");
    expect(await readFile(path.join(sandbox, "about.html"), "utf8")).toBe("about");

    const replaced = await postImport("apply", archive, true);
    expect(replaced.status).toBe(200);
    expect(await replaced.json()).toMatchObject({ ok: true, written: 2, preserved: 0 });
    expect(await readFile(path.join(sandbox, "index.html"), "utf8")).toBe("new");
  });

  it("refuses paths that would write through a file and reports them before apply", async () => {
    await writeFile(path.join(sandbox, "assets"), "not a directory");
    // A second top-level file keeps the archive from being treated as one
    // shared root folder (which import strips).
    const archive = projectZip({ "readme.html": "app", "assets/site.css": "body{}" });

    const preview = await postImport("preview", archive);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ conflicts: 0, blocked: 1 });

    const apply = await postImport("apply", archive, true);
    expect(apply.status).toBe(409);
    expect((await apply.json()).error).toMatch(/protected files or directories/);
    expect(await readFile(path.join(sandbox, "assets"), "utf8")).toBe("not a directory");
  });
});

