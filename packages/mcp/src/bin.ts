#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAuthenik8McpServer, MCP_SERVER_VERSION } from "./server.js";

/**
 * stdio entry point.
 *
 *   authenik8-mcp [--workspace <dir>]
 *
 * The optional workspace root bounds the read-only inspection tool: it can
 * only ever read authenik8.json inside that directory. Nothing is written;
 * nothing is sent over the network; secrets are never read or returned.
 * Protocol traffic uses stdio; diagnostics go to stderr only.
 */

function parseWorkspaceRoot(argv: Array<string>): string | undefined {
  let workspaceRoot: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--workspace") {
      const value = argv[index + 1];
      if (!value) throw new Error("--workspace requires a directory argument");
      workspaceRoot = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--workspace=")) {
      workspaceRoot = argument.slice("--workspace=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return workspaceRoot;
}

async function main(): Promise<void> {
  const workspaceRoot = parseWorkspaceRoot(process.argv.slice(2));
  const server = createAuthenik8McpServer({
    ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
  });
  process.stderr.write(`[authenik8-mcp ${MCP_SERVER_VERSION}] starting on stdio\n`);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  process.stderr.write(`[authenik8-mcp] fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
