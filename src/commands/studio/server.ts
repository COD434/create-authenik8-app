import http, {
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import fs from "fs-extra";

import { currentToolRelease } from "../../lib/release.js";
import type {
  StudioServer,
  StudioServerOptions,
  StudioSnapshot,
} from "./types.js";

type StudioAsset = {
  contentType: string;
  body: Buffer;
};

type StudioAssets = ReadonlyMap<string, StudioAsset>;

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} satisfies OutgoingHttpHeaders;

async function loadStudioAssets(): Promise<StudioAssets> {
  const directory = path.join(currentToolRelease().rootDir, "studio");
  const files = [
    ["/", "index.html", "text/html; charset=utf-8"],
    ["/assets/app.js", "app.js", "text/javascript; charset=utf-8"],
    ["/assets/app.css", "app.css", "text/css; charset=utf-8"],
  ] as const;

  const entries = await Promise.all(files.map(async ([route, filename, contentType]) => {
    const body = await fs.readFile(path.join(directory, filename));
    return [route, { contentType, body }] as const;
  }));
  return new Map(entries);
}

function allowedHost(request: IncomingMessage, port: number): boolean {
  const authority = request.headers.host;
  if (!authority) return false;
  try {
    const url = new URL(`http://${authority}`);
    const expectedPort = String(port);
    const requestPort = url.port || "80";
    return url.username === ""
      && url.password === ""
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      && requestPort === expectedPort;
  } catch {
    return false;
  }
}

function send(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  contentType: string,
  body: Buffer,
): void {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": contentType,
    "Content-Length": String(body.byteLength),
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

export async function startStudioServer(
  snapshot: StudioSnapshot,
  options: StudioServerOptions,
): Promise<StudioServer> {
  const host = options.host ?? "127.0.0.1";
  const [assets, snapshotBody] = await Promise.all([
    loadStudioAssets(),
    Promise.resolve(Buffer.from(`${JSON.stringify(snapshot)}\n`)),
  ]);
  let listeningPort = options.port;

  const server = http.createServer((request, response) => {
    if (!allowedHost(request, listeningPort)) {
      send(
        request,
        response,
        403,
        "text/plain; charset=utf-8",
        Buffer.from("Forbidden\n"),
      );
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      send(
        request,
        response,
        405,
        "text/plain; charset=utf-8",
        Buffer.from("Method Not Allowed\n"),
      );
      return;
    }

    let pathname: string;
    try {
      const target = request.url ?? "/";
      if (!target.startsWith("/") || target.startsWith("//")) {
        throw new Error("Studio accepts only origin-form request targets.");
      }
      pathname = new URL(target, `http://${request.headers.host}`).pathname;
    } catch {
      send(
        request,
        response,
        400,
        "text/plain; charset=utf-8",
        Buffer.from("Bad Request\n"),
      );
      return;
    }

    if (pathname === "/api/snapshot") {
      send(request, response, 200, "application/json; charset=utf-8", snapshotBody);
      return;
    }
    if (pathname === "/favicon.ico") {
      response.writeHead(204, securityHeaders);
      response.end();
      return;
    }

    const asset = assets.get(pathname);
    if (asset) {
      send(request, response, 200, asset.contentType, asset.body);
      return;
    }
    send(
      request,
      response,
      404,
      "text/plain; charset=utf-8",
      Buffer.from("Not Found\n"),
    );
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 2_000;
  server.maxHeadersCount = 32;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Studio could not determine its loopback address.");
  }
  listeningPort = address.port;

  return {
    url: `http://${host}:${listeningPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections();
      }),
  };
}
