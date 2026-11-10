import { afterAll, describe, expect, it } from "vitest";
import { createServer as createNetServer } from "node:net";
import { createServer } from "node:http";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { isDirectInvocation, isPortFree, pickFreePort, studioAlreadyRunning } from "./bin.mjs";

const occupied = [];

async function occupy(port) {
  const holder = createNetServer();
  await new Promise((resolve) => holder.listen(port, "127.0.0.1", resolve));
  occupied.push(holder);
}

afterAll(async () => {
  for (const holder of occupied) await new Promise((resolve) => holder.close(resolve));
});

describe("launcher port discipline", () => {
  it("picks a genuinely bindable port near the requested one", async () => {
    const port = await pickFreePort(5270);
    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThanOrEqual(5270);
    expect(port).toBeLessThanOrEqual(5280);
    // The returned port really is bindable right now.
    expect(await isPortFree(port)).toBe(true);
  });

  it("gives up with null when the whole preferred range is busy", async () => {
    for (let port = 5290; port <= 5300; port += 1) await occupy(port);
    expect(await pickFreePort(5290)).toBeNull();
  });
});

describe("studio adoption probe", () => {
  const httpServers = [];

  afterAll(async () => {
    for (const server of httpServers) await new Promise((resolve) => server.close(resolve));
  });

  async function serveHttp(port, handler) {
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    httpServers.push(server);
  }

  it("recognizes our run-status shape as an already-running studio", async () => {
    await serveHttp(5310, (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"running":false}');
    });
    expect(await studioAlreadyRunning(5310)).toBe(true);
  });

  it("rejects generic web servers, wrong shapes, and dead ports", async () => {
    await serveHttp(5311, (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"hello":"world"}');
    });
    expect(await studioAlreadyRunning(5311)).toBe(false); // not our shape

    await serveHttp(5312, (_req, res) => res.end("<html>someone else</html>"));
    expect(await studioAlreadyRunning(5312)).toBe(false);

    expect(await studioAlreadyRunning(5313)).toBe(false); // nothing listens
  });
});

describe("direct invocation detection", () => {
  const packageRoot = path.dirname(fileURLToPath(import.meta.url));
  const realBin = path.join(packageRoot, "bin.mjs");
  // The exact path the npm shim executes: through the node_modules junction.
  const linkedBin = path.resolve(packageRoot, "../../node_modules/create-authenik8-studio/bin.mjs");

  it("matches a plain entry path", () => {
    expect(isDirectInvocation(pathToFileURL(realBin).href, realBin)).toBe(true);
  });

  it("survives the workspace junction launch (npm exec regression)", () => {
    // The fixture must be a genuine junction: the linked path resolves elsewhere.
    expect(realpathSync(linkedBin)).not.toBe(linkedBin);
    // Node reports import.meta.url as the REAL path while argv[1] is LINKED —
    // the pre-fix raw comparison missed this and the bin silently no-oped.
    const metaUrl = pathToFileURL(realpathSync(realBin)).href;
    expect(isDirectInvocation(metaUrl, linkedBin)).toBe(true);
  });

  it("rejects foreign and missing entry paths", () => {
    const metaUrl = pathToFileURL(realBin).href;
    expect(isDirectInvocation(metaUrl, path.join(packageRoot, "package.json"))).toBe(false);
    expect(isDirectInvocation(metaUrl, undefined)).toBe(false);
  });
});
