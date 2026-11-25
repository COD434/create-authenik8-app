import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RouteContext } from "../studio-types.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const MARKETING_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../marketing");

/** Ordered classic scripts that make up the Studio shell (see index.html). */
const STUDIO_APP_SCRIPTS = [
  "state",
  "execution-store",
  "execution-timeline",
  "ui",
  "chat",
  "preview",
  "agent",
  "template",
  "review",
  "run",
  "shell",
  "ship",
  "palette",
  "boot",
] as const;

function studioScript(name: string): { file: string; type: string; root: "studio" } {
  return { file: `app-${name}.js`, type: "text/javascript; charset=utf-8", root: "studio" };
}

const STATIC_FILES: Record<string, { file: string; type: string; root: "studio" | "marketing" }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/docs": { file: "docs.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/docs/": { file: "docs.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/download": { file: "download.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/download/": { file: "download.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/pricing": { file: "pricing.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/pricing/": { file: "pricing.html", type: "text/html; charset=utf-8", root: "marketing" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8", root: "marketing" },
  "/authenik8-mark.svg": { file: "authenik8-mark.svg", type: "image/svg+xml", root: "marketing" },
  "/assets/integrations/opencode.png": { file: "assets/integrations/opencode.png", type: "image/png", root: "marketing" },
  "/assets/integrations/openrouter.png": { file: "assets/integrations/openrouter.png", type: "image/png", root: "marketing" },
  "/assets/integrations/coderabbit.png": { file: "assets/integrations/coderabbit.png", type: "image/png", root: "marketing" },
  "/assets/integrations/supabase.png": { file: "assets/integrations/supabase.png", type: "image/png", root: "marketing" },
  "/assets/integrations/github.png": { file: "assets/integrations/github.png", type: "image/png", root: "marketing" },
  "/assets/integrations/vercel.png": { file: "assets/integrations/vercel.png", type: "image/png", root: "marketing" },
  "/assets/integrations/netlify.png": { file: "assets/integrations/netlify.png", type: "image/png", root: "marketing" },
  "/studio": { file: "index.html", type: "text/html; charset=utf-8", root: "studio" },
  "/studio/": { file: "index.html", type: "text/html; charset=utf-8", root: "studio" },
  "/studio/style.css": { file: "style.css", type: "text/css; charset=utf-8", root: "studio" },
  "/studio/authenik8-logo.svg": { file: "authenik8-logo.svg", type: "image/svg+xml", root: "studio" },
  "/studio/authenik8-mark.svg": { file: "authenik8-mark.svg", type: "image/svg+xml", root: "studio" },
  ...Object.fromEntries(
    STUDIO_APP_SCRIPTS.map((name) => [`/studio/app-${name}.js`, studioScript(name)]),
  ),
};

/** Serve the studio shell and the marketing pages from their own roots. */
export async function serveStaticFile(ctx: RouteContext): Promise<boolean> {
  if (ctx.req.method !== "GET" || !(ctx.url.pathname in STATIC_FILES)) return false;
  const entry = STATIC_FILES[ctx.url.pathname]!;
  const directory = entry.root === "marketing" ? MARKETING_DIR : PUBLIC_DIR;
  const content = entry.type === "image/png"
    ? await readFile(path.join(directory, entry.file))
    : await readFile(path.join(directory, entry.file), "utf8");
  // The app's own files must never be heuristically cached: a stale
  // shell script or style.css in the tab's cache makes every shipped fix
  // look like it did nothing (exactly the "the X button is dead" report).
  ctx.res.writeHead(200, { "content-type": entry.type, "cache-control": "no-store" });
  ctx.res.end(content);
  return true;
}
