import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it } from "vitest";

import { createAuthenik8McpServer, MCP_SERVER_VERSION } from "../src/server.js";
import { SPEC_SNAPSHOT, SPEC_SUPPORTED } from "../src/spec.js";
import { readFileSync } from "node:fs";

const fixtureSource = readFileSync(new URL("./fixtures/demo-authenik8.json", import.meta.url), "utf8");

const tempDirs: Array<string> = [];
function makeWorkspace(withEnvSecret = false): string {
  const dir = mkdtempSync(path.join(tmpdir(), "authenik8-mcp-workspace-"));
  tempDirs.push(dir);
  writeFileSync(path.join(dir, "authenik8.json"), fixtureSource);
  if (withEnvSecret) {
    writeFileSync(path.join(dir, ".env"), "SECRET_TOKEN=SUPER_SECRET_VALUE_12345\n");
  }
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function connect(workspaceRoot?: string) {
  const server = createAuthenik8McpServer({ ...(workspaceRoot !== undefined ? { workspaceRoot } : {}) });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function callJson(client: Client, name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, ...(args !== undefined ? { arguments: args } : {}) });
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  expect(content?.[0]?.type).toBe("text");
  return JSON.parse(content![0]!.text!) as Record<string, unknown>;
}

const FULLSTACK_SPEC = {
  projectName: "my-app",
  preset: "fullstack",
  frontend: "next",
  authMethods: ["password", "google", "github"],
};

describe("authenik8-mcp protocol surface", () => {
  it("exposes exactly the four read-only planning tools", async () => {
    const client = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "get_project_contract",
      "get_supported_features",
      "plan_authenik8_project",
      "validate_project_spec",
    ]);
    for (const tool of tools.tools) {
      expect(tool.description, `${tool.name} must document its boundary`).toBeTruthy();
    }
  });

  it("reports the server version and supported features with provenance", async () => {
    const client = await connect();
    const result = await callJson(client, "get_supported_features");
    expect(result.ok).toBe(true);
    expect(result.supported).toEqual(SPEC_SUPPORTED);
    expect(result.provenance).toEqual(SPEC_SNAPSHOT);
    expect(result.identity).toMatchObject({ server: "authenik8-mcp", specVersion: 1 });
  });

  it("plans a fullstack project with a verified non-interactive command", async () => {
    const client = await connect();
    const result = await callJson(client, "plan_authenik8_project", FULLSTACK_SPEC);
    expect(result.ok).toBe(true);
    const plan = result.plan as Record<string, unknown>;
    expect(plan.summary).toContain("fullstack");
    expect(plan.suggestedCommand).toContain("--preset fullstack");
    expect(plan.suggestedCommand).toContain("--frontend next");
    expect(plan.suggestedCommand).toContain("--database postgresql");
    expect(plan.suggestedCommand).toContain("--package-manager npm");
    expect(plan.suggestedCommand).toContain("--oauth google,github");
    expect(plan.suggestedCommand).toContain("--yes");
    expect(plan.followUps).toEqual(["npx create-authenik8-app doctor"]);
    const shape = plan.manifestShape as Array<{ field: string; value: unknown; decidedBy: string }>;
    expect(shape.find((entry) => entry.field === "features.pm2")?.value).toBe(false);
    expect(shape.find((entry) => entry.field === "engine.version")?.decidedBy).toBe("generator");
  });

  it("returns structured issues instead of throwing for an invalid plan", async () => {
    const client = await connect();
    const result = await callJson(client, "plan_authenik8_project", {
      projectName: "my-app",
      preset: "fullstack",
      authMethods: ["google"],
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { path: "authMethods", message: expect.stringContaining("Email and password is required") },
    ]);
  });

  it("validates and normalizes specs through the protocol", async () => {
    const client = await connect();
    const valid = await callJson(client, "validate_project_spec", FULLSTACK_SPEC);
    expect(valid.valid).toBe(true);
    expect(valid.normalized).toMatchObject({ database: "postgresql", runtime: "node", oauthProviders: ["google", "github"] });

    const invalid = await callJson(client, "validate_project_spec", {
      projectName: "my-app",
      preset: "auth-oauth",
    });
    expect(invalid.valid).toBe(false);
    // Mirrored CLI rules: both the provider requirement and the database
    // requirement fire for this spec.
    expect(invalid.issues).toEqual([
      { path: "oauthProviders", message: "Select at least one OAuth provider" },
      { path: "database", message: "Select a database" },
    ]);
  });

  it("reads the project contract from a real generated manifest", async () => {
    const client = await connect(await makeWorkspace());
    const result = await callJson(client, "get_project_contract", { root: "." });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("valid");
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      preset: "fullstack",
      database: "postgresql",
      generatedBy: { package: "create-authenik8-app", version: "2.4.4" },
      engine: { package: "authenik8-core", version: "2.0.7" },
    });
  });

  it("refuses to inspect paths outside the workspace", async () => {
    const client = await connect(await makeWorkspace());
    for (const root of ["../elsewhere", "C:\\Windows", "..\\..\\etc"]) {
      const result = await callJson(client, "get_project_contract", { root });
      expect(result.ok, root).toBe(false);
      expect(result.code, root).toBe("outside_workspace");
    }
  });

  it("refuses inspection entirely when no workspace is configured", async () => {
    const client = await connect();
    const result = await callJson(client, "get_project_contract", {});
    expect(result).toMatchObject({ ok: false, code: "no_workspace_configured" });
  });

  it("never surfaces environment secret values in any tool result", async () => {
    const client = await connect(await makeWorkspace(true));
    for (const name of ["get_supported_features", "get_project_contract"]) {
      const result = await callJson(client, name, { root: "." });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("SUPER_SECRET_VALUE_12345");
      expect(serialized).not.toContain("SECRET_TOKEN");
    }
  });

  it("reports a missing manifest structurally", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "authenik8-mcp-empty-"));
    tempDirs.push(dir);
    const client = await connect(dir);
    const result = await callJson(client, "get_project_contract", {});
    expect(result).toMatchObject({ ok: true, status: "missing" });
  });
});

describe("server metadata", () => {
  it("uses a stable server name and version", () => {
    expect(MCP_SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
