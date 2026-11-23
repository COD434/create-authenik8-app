import type { ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { resolveInsideSandbox } from "./tools.js";

/** Preview content types: strict allow-list, default octet-stream. */
const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function previewNotFound(res: ServerResponse): void {
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(
    "<!doctype html><meta charset='utf-8'><body style=\"font-family:system-ui;background:#0b0e14;"
    + "color:#8b94a7;display:grid;place-items:center;height:100vh;margin:0\">"
    + "<p>Nothing here yet — ask the assistant to build it.</p></body>",
  );
}

/**
 * Read-only static serving of the sandbox at /preview/.
 *
 * Path discipline: segments are checked BEFORE resolution (no traversal, no
 * dotfiles — .env and .git are never served), then re-verified through the
 * same sandbox guard as the write tools. This is the studio's window on what
 * the model built; the studio UI embeds it in a sandboxed iframe (opaque
 * origin), so model-written scripts cannot reach the chat or the key.
 */
export function servePreview(sandboxRoot: string, url: URL, res: ServerResponse): void {
  let requested = "";
  if (url.pathname !== "/preview" && url.pathname !== "/preview/") {
    try {
      requested = decodeURIComponent(url.pathname.slice("/preview/".length));
    } catch {
      previewNotFound(res);
      return;
    }
  }

  let target: string;
  if (requested === "") {
    target = path.join(sandboxRoot, "index.html");
  } else {
    const segments = requested.split("/");
    if (segments.some((segment) => segment === "" || segment.startsWith("."))) {
      previewNotFound(res);
      return;
    }
    const resolved = resolveInsideSandbox(sandboxRoot, requested);
    if (resolved === null) {
      previewNotFound(res);
      return;
    }
    target = resolved;
  }

  void stat(target)
    .then((info) => {
      if (info.isDirectory()) target = path.join(target, "index.html");
      return readFile(target);
    })
    .then((content) => {
      const type = PREVIEW_CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff", "cache-control": "no-store" });
      res.end(content);
    })
    .catch(() => previewNotFound(res));
}
