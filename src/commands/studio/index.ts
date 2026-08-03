import { spawn } from "node:child_process";
import path from "node:path";

import { createStudioSnapshot } from "./snapshot.js";
import { startStudioServer } from "./server.js";
import type {
  StudioOptions,
  StudioServer,
} from "./types.js";

export class StudioUsageError extends Error {}

const defaultStudioPort = 5558;

function parsePort(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new StudioUsageError("--port requires an integer from 1 to 65535.");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new StudioUsageError("--port requires an integer from 1 to 65535.");
  }
  return port;
}

export function parseStudioArguments(
  args: readonly string[],
  cwd = process.cwd(),
): StudioOptions {
  let directory: string | undefined;
  let port = defaultStudioPort;
  let openBrowser = true;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--port") {
      port = parsePort(args[index + 1]);
      index += 1;
    } else if (argument.startsWith("--port=")) {
      port = parsePort(argument.slice("--port=".length));
    } else if (argument === "--no-open") {
      openBrowser = false;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("-")) {
      throw new StudioUsageError(`Unknown Studio option: ${argument}`);
    } else if (directory) {
      throw new StudioUsageError("Studio accepts at most one project directory.");
    } else {
      directory = argument;
    }
  }

  return {
    directory: path.resolve(cwd, directory ?? "."),
    port,
    openBrowser,
    help,
  };
}

export function openStudioBrowser(url: string): void {
  const command = process.platform === "darwin"
    ? { executable: "open", args: [url] }
    : process.platform === "win32"
      ? { executable: "cmd", args: ["/c", "start", "", url] }
      : { executable: "xdg-open", args: [url] };
  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.once("error", () => {
    // The printed loopback URL remains the reliable fallback.
  });
  child.unref();
}

export async function runStudio(options: StudioOptions): Promise<StudioServer> {
  const snapshot = await createStudioSnapshot(options.directory);
  const studio = await startStudioServer(snapshot, { port: options.port });
  if (options.openBrowser) openStudioBrowser(studio.url);
  return studio;
}
