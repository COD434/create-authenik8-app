import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The zero-dependency static server the studio writes into a static sandbox
 * before a run: `npm start = node server.js` so Run works for every
 * chat-generated app, deterministic content (no model round-trip).
 * Studio-written copies open with BOOTSTRAP_MARKER: a marker match means the
 * file is ours and may be refreshed to the current template later; a model's
 * or user's own server.js never touches that prefix, so it is never clobbered.
 */
const BOOTSTRAP_MARKER = "// Written by Authenik8 Studio Web";
const BOOTSTRAP_SERVER_JS = `${BOOTSTRAP_MARKER}: minimal zero-dependency static server.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT ?? 3000);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2" };

// The studio can restart while an earlier run's server still holds this
// port; scan upward instead of dying on EADDRINUSE.
function bind(current) {
  const server = http.createServer((req, res) => {
    let name;
    try {
      name = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400); res.end(); return;
    }
    if (name === "/") name = "/index.html";
    if (name.startsWith("/") === false || name.includes("..") || /(^|\\/)\\./.test(name.slice(1))) {
      res.writeHead(403); res.end(); return;
    }
    const file = path.join(root, name);
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("Not found"); return; }
      res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE" && current < port + 9) bind(current + 1);
    else { console.error((error && error.message) || String(error)); process.exit(1); }
  });
  server.listen(current, "127.0.0.1", () => console.log(\`Static app on http://127.0.0.1:\${current}\`));
}
bind(port);
`;

const BOOTSTRAP_MANIFEST = {
  name: "authenik8-static-app",
  private: true,
  scripts: { start: "node server.js" },
};

/**
 * Provision a runnable project for a STATIC sandbox in place: write only the
 * files that are missing (never clobber model/user files), then let the run
 * proceed. Returns null when something usable was already bootstrapped (or
 * skipped because present), otherwise the 422 copy for a sandless state.
 */
export async function ensureStaticRunnable(sandboxRoot: string): Promise<{ note: string } | string | null> {
  let manifestRaw: string | null = null as null | string;
  try {
    manifestRaw = await readFile(path.join(sandboxRoot, "package.json"), "utf8");
  } catch {
    manifestRaw = null;
  }

  if (manifestRaw === null) {
    let hasIndexHtml = true;
    try {
      await stat(path.join(sandboxRoot, "index.html"));
    } catch {
      hasIndexHtml = false;
    }
    if (!hasIndexHtml) {
      return "Nothing to run yet: the sandbox is empty. Describe the app to build, then Run.";
    }

    const notes: string[] = [];
    let serverJs: string | null = null;
    try {
      serverJs = await readFile(path.join(sandboxRoot, "server.js"), "utf8");
    } catch {
      serverJs = null;
    }
    if (serverJs === null) {
      // Missing → write the deterministic one; a custom server.js is never clobbered.
      await writeFile(path.join(sandboxRoot, "server.js"), BOOTSTRAP_SERVER_JS, "utf8");
      notes.push("wrote a zero-dependency server.js");
    } else if (serverJs.startsWith(BOOTSTRAP_MARKER) && serverJs !== BOOTSTRAP_SERVER_JS) {
      // Ours from an earlier studio version: refresh to the current template
      // (markers keep model/user files safe; our own files have no user work).
      await writeFile(path.join(sandboxRoot, "server.js"), BOOTSTRAP_SERVER_JS, "utf8");
      notes.push("refreshed the studio-written server.js");
    }
    await writeFile(path.join(sandboxRoot, "package.json"), JSON.stringify(BOOTSTRAP_MANIFEST, null, 2) + "\n", "utf8");
    notes.push("added package.json with a start script");

    return { note: `Authenik8 bootstrapped the static project for Run: ${notes.join(", ")} (no model call, no dependencies).` };
  }

  // Manifest exists: a model may have promised scripts.start -> node <entry>
  // but never written the entry file (observed live: package.json with
  // "node server.js", no server.js — node crashed instantly). If the entry is
  // a simple module at the sandbox root and the app is static, write the
  // deterministic server AT THAT PATH so the run cannot dead-end. Nothing is
  // clobbered: the file is only written when missing.
  let manifest2: { scripts?: Record<string, unknown> } | null = null;
  try {
    manifest2 = JSON.parse(manifestRaw) as { scripts?: Record<string, unknown> };
  } catch {
    return null; // runBlocker teaches the fix for malformed manifests
  }
  const start = manifest2?.scripts?.start;
  if (typeof start === "string") {
    const nodeEntry = /^node\s+([A-Za-z0-9_.-]+\.[cm]?js)$/i.exec(start.trim());
    if (nodeEntry !== null) {
      const entryPath = path.join(sandboxRoot, nodeEntry[1]!);
      try {
        const existing = await readFile(entryPath, "utf8");
        if (existing.startsWith(BOOTSTRAP_MARKER) && existing !== BOOTSTRAP_SERVER_JS) {
          // Ours from an earlier studio version: refresh to the current
          // template — e.g. the port-scan-safe server — without a model call.
          await writeFile(entryPath, BOOTSTRAP_SERVER_JS, "utf8");
          return {
            note: `Authenik8 refreshed ${nodeEntry[1]} to the current zero-dependency static server (port-scan safe).`,
          };
        }
        return null; // a model's or user's own entry file: untouched
      } catch {
        let hasIndexHtml = false;
        try {
          await stat(path.join(sandboxRoot, "index.html"));
          hasIndexHtml = true;
        } catch {
          hasIndexHtml = false;
        }
        if (hasIndexHtml) {
          await writeFile(entryPath, BOOTSTRAP_SERVER_JS, "utf8");
          return {
            note: `Authenik8 wrote ${nodeEntry[1]} (zero-dependency static server) because scripts.start referenced it but the file was missing (no model call, no dependencies).`,
          };
        }
      }
    }
  }
  return null;
}

export async function runBlocker(sandboxRoot: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(sandboxRoot, "package.json"), "utf8");
  } catch {
    return "No package.json in the sandbox yet: static apps are already live in the Preview pane. To run a server, ask the assistant to add a package.json with a start script.";
  }
  let manifest: { scripts?: Record<string, unknown> };
  try {
    manifest = JSON.parse(raw) as { scripts?: Record<string, unknown> };
  } catch {
    return "The sandbox package.json is not valid JSON — ask the assistant to fix it, then run again.";
  }
  const start = manifest.scripts?.start;
  if (typeof start !== "string" || start.length === 0) {
    return "The sandbox package.json has no start script — ask the assistant to add one (e.g. \"start\": \"node server.js\"), then run again.";
  }
  return null;
}
