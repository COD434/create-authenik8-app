#!/usr/bin/env node
/**
 * `npx create-authenik8-studio` — the one-liner launcher for Studio Web.
 *
 * Boot discipline:
 * - picks a free port near 4870 (never meets a raw EADDRINUSE);
 * - starts the localhost studio (files, preview iframe, agent, run all stay
 *   on this machine by design);
 * - opens the browser tab, then keeps running until the user closes it.
 *
 * Nothing is uploaded anywhere: the OpenRouter key lives in the browser tab
 * only (BYOK), and no telemetry exists.
 */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const usage = [
  "create-authenik8-studio — boot the Authenik8 Studio Web builder and open it",
  "",
  "Usage: create-authenik8-studio [--port <n>] [--no-open]",
  "",
  "  --port <n>   preferred port (default 4870; busy ports fall back upward)",
  "  --no-open    do not open the browser tab",
  "",
  "Everything runs on this machine. Your OpenRouter key lives in the browser tab only.",
].join("\n");

export function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

export async function pickFreePort(start) {
  for (let port = start; port <= start + 10; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

export function openInBrowser(url) {
  try {
    if (process.platform === "win32") {
      // `start` treats its first quoted argument as a window title.
      spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    console.log(`Open this in your browser: ${url}`);
  }
}

export async function boot(argv = []) {
  let requested = null;
  let openBrowser = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      index += 1;
      const value = Number(argv[index]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        console.error("--port needs a valid port number, e.g. --port 5090");
        process.exit(1);
      }
      requested = value;
    } else if (arg === "--no-open") {
      openBrowser = false;
    } else if (arg === "-h" || arg === "--help") {
      console.log(usage);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}\n\n${usage}`);
      process.exit(1);
    }
  }

  const preferred = requested ?? Number(process.env.PORT ?? 4870);
  const port = await pickFreePort(preferred);
  if (port === null) {
    console.error(`Ports ${preferred}-${preferred + 10} are all busy. Free one up, or try again with --port <n>.`);
    process.exit(1);
  }
  if (port !== preferred) console.log(`Port ${preferred} is busy — starting on ${port} instead.`);

  try {
    const studio = await import("@authenik8/web-studio");
    studio.startStudio({ port, onReady: (url) => { if (openBrowser) openInBrowser(url); } });
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      console.error("Authenik8 web-studio could not be loaded. If you are running from a clone of the workspace:");
      console.error("  npm install");
      console.error("  npm run build");
      console.error("then try again. (The published launcher will carry the prebuilt studio.)");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Whether this module is the process entry point. Survives npm workspaces:
 * the bin shim runs the entry through a node_modules junction, so argv[1]
 * (linked path) differs from import.meta.url (real path). Both are compared
 * after realpath resolution — a junction launch must not silently no-op.
 */
export function isDirectInvocation(metaUrl, entryPath) {
  if (entryPath === undefined || entryPath === null) return false;
  let real = entryPath;
  try {
    real = realpathSync(entryPath);
  } catch {
    // keep the raw path when it does not exist (or cannot be resolved)
  }
  return pathToFileURL(entryPath).href === metaUrl || pathToFileURL(real).href === metaUrl;
}

const invokedDirectly = isDirectInvocation(import.meta.url, process.argv[1]);
if (invokedDirectly) {
  await boot(process.argv.slice(2));
}
