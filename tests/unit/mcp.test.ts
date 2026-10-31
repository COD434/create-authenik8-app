import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { handleRequest } from "../../src/commands/mcp/index.js";
import { diagnosticDefinition } from "../../src/commands/doctor/catalog.js";

const tempRoots: string[] = [];

async function makeFixtureProject(manifestSource: string): Promise<string> {
  const rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "authenik8-mcp-")));
  tempRoots.push(rootDir);
  await fs.writeFile(path.join(rootDir, "authenik8.json"), manifestSource);
  return rootDir;
}

const manifestFixture = `{
  "schemaVersion": 1,
  "projectName": "generated-app",
  "generatorVersion": "0.0.0",
  "identityEngine": { "package": "authenik8-core", "version": "2.0.7" },
  "preset": "base",
  "packageManager": "npm",
  "runtime": "node",
  "database": "sqlite",
  "features": { "prisma": true, "oauthProviders": [], "pm2": false }
}
`;

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((rootDir) => fs.remove(rootDir)));
});

describe("Authenik8 MCP server", () => {
  it("answers initialize with the server identity and tool capability", async () => {
    const result = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

    expect(result).toMatchObject({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "authenik8-mcp" },
    });
  });

  it("lists the read-only diagnostic tools", async () => {
    const result = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) as {
      tools: Array<{ name: string }>;
    };

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "authenik8_doctor_offline",
      "authenik8_explain_diagnostic",
      "authenik8_list_diagnostics",
      "authenik8_project_manifest",
      "authenik8_upgrade_plan",
    ]);
    for (const nonDiagnosticToolName of [
      "generate_project",
      "revoke_session",
      "rotate_signing_key",
      "add_resource",
      "add_role",
      "add_oauth_provider",
    ]) {
      expect(result.tools.map((tool) => tool.name)).not.toContain(nonDiagnosticToolName);
    }
  });

  it("explains a stable diagnostic ID in stable and legacy form", async () => {
    const stable = await handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "authenik8_explain_diagnostic", arguments: { id: "A8-PROJECT-004" } },
    }) as { content: Array<{ text: string }> };
    expect(JSON.parse(stable.content[0]!.text)).toMatchObject({
      id: "A8-PROJECT-004",
      legacyId: "project.ai-editor-support",
    });

    const legacy = await handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "authenik8_explain_diagnostic", arguments: { id: "project.ai-editor-support" } },
    }) as { content: Array<{ text: string }> };
    expect(legacy.content[0]!.text).toContain("A8-PROJECT-004");
  });

  it("returns an explicit unknown-diagnostic message", async () => {
    const result = await handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "authenik8_explain_diagnostic", arguments: { id: "A8-NOT-REAL" } },
    }) as { content: Array<{ text: string }> };
    expect(result.content[0]!.text).toContain("Unknown diagnostic: A8-NOT-REAL");
  });

  it("lists diagnostic definitions", async () => {
    const result = await handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "authenik8_list_diagnostics", arguments: {} },
    }) as { content: Array<{ text: string }> };

    const definitions = JSON.parse(result.content[0]!.text) as Array<unknown>;
    expect(definitions.length).toBeGreaterThan(20);
    expect(result.content[0]!.text).not.toContain("SECRET");
  });

  it("reads the project manifest from a directory", async () => {
    const directory = await makeFixtureProject(manifestFixture);

    const result = await handleRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "authenik8_project_manifest", arguments: { directory } },
    }) as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      schemaVersion: 1,
      preset: "base",
    });
    expect(result.content[0]!.text).not.toContain("SECRET");
  });

  it("surfaces a missing manifest as an error result", async () => {
    const directory = await makeFixtureProject(manifestFixture);
    await fs.rm(path.join(directory, "authenik8.json"));

    await expect(handleRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "authenik8_project_manifest", arguments: { directory } },
    })).rejects.toThrow("ENOENT");
  });

  it("rejects unknown tools with an explicit error", async () => {
    await expect(handleRequest({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "authenik8_generate_project", arguments: {} },
    })).rejects.toThrow("Unknown tool: authenik8_generate_project");
  });

  it("reports offline doctor failures for project-less directories", async () => {
    const directory = await makeFixtureProject(manifestFixture);

    await expect(handleRequest({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "authenik8_doctor_offline", arguments: { directory } },
    })).rejects.toThrow();
  });

  it("keeps the new catalog entry explainable through the shared catalog", () => {
    expect(diagnosticDefinition("A8-PROJECT-004")).toBeDefined();
    expect(diagnosticDefinition("A8-NOT-REAL")).toBeUndefined();
  });
});
