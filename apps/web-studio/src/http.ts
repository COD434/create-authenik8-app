import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * HTTP primitives shared by the studio's routes.
 *
 * Trust boundary: bodies are size-capped before parsing, state-changing
 * requests are checked against the local page, and API responses are never
 * cached because they can carry conversation or project evidence.
 */

export const MAX_BODY_BYTES = 1024 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  // API responses can contain conversation and project evidence. Keep them
  // out of the browser's disk cache, matching the static shell's no-store.
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function sseEvent(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Abort work when the streaming response socket closes before completion. */
export function abortOnDisconnect(res: ServerResponse, abort: AbortController): void {
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
}

export function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    let text = "";
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      text += chunk.toString("utf8");
    });
    req.on("end", () => resolve(text));
    req.on("error", () => resolve(null));
  });
}

export function readBinaryBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(tooLarge ? null : Buffer.concat(chunks, size)));
    req.on("error", () => resolve(null));
  });
}

export function apiKeyFrom(req: IncomingMessage): string | null {
  const header = req.headers["x-openrouter-key"];
  const value = Array.isArray(header) ? header[0] : header;
  const key = value?.trim() ?? "";
  return key.length > 0 ? key : null;
}

/** Reject browser-originated state changes that did not come from this local UI.
 * Host validation also closes the DNS-rebinding case where an attacker maps
 * their own hostname to loopback. Origin-less local CLI clients remain usable.
 */
export function isTrustedLocalMutation(req: IncomingMessage): boolean {
  const hostHeader = req.headers.host;
  if (typeof hostHeader !== "string") return false;
  let host: URL;
  try {
    host = new URL(`http://${hostHeader}`);
  } catch {
    return false;
  }
  if (host.username || host.password || host.pathname !== "/"
    || (host.hostname !== "127.0.0.1" && host.hostname !== "localhost")) return false;

  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite === "cross-site") return false;

  const originHeader = req.headers.origin;
  if (originHeader === undefined) return true;
  try {
    const origin = new URL(originHeader);
    return originHeader === origin.origin && origin.origin === `http://${host.host}`;
  } catch {
    return false;
  }
}

/** JSON body parse that reports malformed input instead of throwing. */
export function parseJsonBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
