import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  authMethodSchema,
  databaseSchema,
  frontendSchema,
  oauthProviderSchema,
  packageManagerSchema,
  presetSchema,
  projectSpecSchema,
  runtimeSchema,
} from "./spec.js";
import { createToolHandlers, type ToolHandlers, type ToolResult } from "./tools.js";

/**
 * MCP server wiring: four read-only, planning-oriented tools with narrow
 * JSON-schema-narrowed inputs. No write tools exist; no tool executes
 * code or shells out; no tool reads anything but the project manifest
 * inside the configured workspace.
 */

export const MCP_SERVER_NAME = "authenik8-mcp";
export const MCP_SERVER_VERSION = "0.1.0";

const projectNameRule = z
  .string()
  .max(214)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, {
    message: "Use a lowercase name containing only letters, numbers, dots, hyphens, or underscores.",
  });

const specInputShape = {
  projectName: projectNameRule.describe("Lowercase npm-style project name"),
  preset: presetSchema.describe("Generator preset"),
  frontend: frontendSchema.optional().describe("Frontend target (fullstack preset)"),
  authMethods: z.array(authMethodSchema).optional().describe("Authentication methods to enable"),
  oauthProviders: z.array(oauthProviderSchema).optional().describe("OAuth providers to enable"),
  usePrisma: z.boolean().optional().describe("Add Prisma"),
  database: databaseSchema.optional().describe("Database choice"),
  runtime: runtimeSchema.optional().describe("Runtime"),
  packageManager: packageManagerSchema.optional().describe("Package manager"),
  useGit: z.boolean().optional().describe("Initialize a Git repository"),
  productionReady: z.boolean().optional().describe("Generate production runtime config (PM2)"),
};

function jsonContent(result: ToolResult) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function registerReadTools(server: McpServer, handlers: ToolHandlers): void {
  server.registerTool(
    "get_supported_features",
    {
      title: "Authenik8 supported features",
      description:
        "List the Authenik8 generator options this server supports (presets, frontends, databases, runtimes, OAuth providers, auth methods, package managers) plus the spec snapshot provenance. Read-only.",
      inputSchema: {},
    },
    async () => jsonContent(handlers.getSupportedFeatures()),
  );

  server.registerTool(
    "get_project_contract",
    {
      title: "Read the Authenik8 project contract",
      description:
        "Read-only inspection: parse authenik8.json (the source-controlled project manifest) from a directory inside the server's workspace and return the validated contract. Reads only that one file; never returns file contents or environment values; refuses paths outside the configured workspace.",
      inputSchema: {
        root: z.string().optional().describe("Directory to inspect, relative to the workspace root (default '.')"),
      },
    },
    async (args) => jsonContent(handlers.getProjectContract(args.root)),
  );
}

function registerSpecTools(server: McpServer, handlers: ToolHandlers): void {
  server.registerTool(
    "plan_authenik8_project",
    {
      title: "Plan an Authenik8 project",
      description:
        "Turn a generation request into a plan: decisions, a non-interactive CLI command, the authenik8.json contract shape, and follow-up checks. Pure planning — nothing is generated, written, or installed.",
      inputSchema: specInputShape,
    },
    async (args) => {
      const parsed = projectSpecSchema.safeParse(args);
      if (!parsed.success) {
        return jsonContent({ ok: false, issues: [{ path: "spec", message: "Invalid planning request" }] });
      }
      return jsonContent(handlers.planProject(parsed.data));
    },
  );

  server.registerTool(
    "validate_project_spec",
    {
      title: "Validate an Authenik8 project spec",
      description:
        "Validate a generation request against the Authenik8 preset rules (mirrored from the CLI at a recorded snapshot) and return the normalized spec. Structured issues with stable paths; never throws for invalid input.",
      inputSchema: specInputShape,
    },
    async (args) => {
      const parsed = projectSpecSchema.safeParse(args);
      if (!parsed.success) {
        return jsonContent({ ok: true, valid: false, issues: [{ path: "spec", message: "Invalid request shape" }] });
      }
      return jsonContent(handlers.validateSpec(parsed.data));
    },
  );
}

export function createAuthenik8McpServer(options: { workspaceRoot?: string } = {}): McpServer {
  const handlers = createToolHandlers(options);
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  registerReadTools(server, handlers);
  registerSpecTools(server, handlers);
  return server;
}
