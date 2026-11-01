import fs from "fs-extra";
import path from "node:path";
import { runStaticChecks } from "../doctor/checks.js";
import { createDoctorContext } from "../doctor/context.js";
import { diagnosticDefinition, diagnosticDefinitions, stableDiagnosticId } from "../doctor/catalog.js";
import { runUpgrade } from "../upgrade/index.js";
import { createAddContext } from "../add/context.js";
import { parseResourceFields, planResource } from "../add/resource.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
};

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * Handles a single JSON-RPC 2.0 request. Exported for testing; the stdio loop
 * in runMcpServer keeps the transport side-effect isolated.
 */
export async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "authenik8-mcp", version: "0.1.0" },
      };
    case "tools/list":
      return {
        tools: [
          {
            name: "authenik8_doctor_offline",
            description: "Run offline Authenik8 Doctor checks for a project directory.",
            inputSchema: {
              type: "object",
              properties: { directory: { type: "string" } },
              required: ["directory"],
            },
          },
          {
            name: "authenik8_explain_diagnostic",
            description: "Explain an Authenik8 diagnostic ID.",
            inputSchema: {
              type: "object",
              properties: { id: { type: "string" } },
              required: ["id"],
            },
          },
          {
            name: "authenik8_project_manifest",
            description: "Read the source-controlled authenik8.json manifest for a project.",
            inputSchema: {
              type: "object",
              properties: { directory: { type: "string" } },
              required: ["directory"],
            },
          },
          {
            name: "authenik8_upgrade_plan",
            description: "Generate an Authenik8 upgrade plan for a project directory.",
            inputSchema: {
              type: "object",
              properties: { directory: { type: "string" } },
              required: ["directory"],
            },
          },
          {
            name: "authenik8_list_diagnostics",
            description: "List all Authenik8 diagnostic definitions.",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "authenik8_plan_resource_scaffold",
            description:
              "Plan a fullstack Authenik8 resource scaffold (Prisma model, Zod contracts, API module, OpenAPI, typed client, optional policy test, optional React CRUD pages) WITHOUT writing files. Apply the printed plan afterwards with the 'authenik8 add resource' CLI command.",
            inputSchema: {
              type: "object",
              properties: {
                directory: { type: "string" },
                name: { type: "string", description: "PascalCase resource name, e.g. Invoice" },
                fields: {
                  type: "string",
                  description:
                    'Comma-separated field spec, e.g. "amount:number,dueAt:date?,status:enum(DRAFT,ACTIVE)"; trailing ? marks a field nullable',
                },
                withTests: { type: "boolean", description: "Also plan a pure ownership-policy test" },
                withCrudUi: { type: "boolean", description: "Also plan the wired React CRUD pages" },
              },
              required: ["directory", "name", "fields"],
            },
          },
        ],
      };
    case "tools/call": {
      const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      if (params?.name === "authenik8_doctor_offline") {
        const directory = String(params.arguments?.directory ?? ".");
        const context = await createDoctorContext(directory, { offline: true });
        const checks = await runStaticChecks(context);
        return { content: [{ type: "text", text: JSON.stringify(checks, null, 2) }] };
      }
      if (params?.name === "authenik8_explain_diagnostic") {
        const id = String(params.arguments?.id ?? "");
        const definition = diagnosticDefinition(stableDiagnosticId(id));
        return {
          content: [
            {
              type: "text",
              text: definition ? JSON.stringify(definition, null, 2) : `Unknown diagnostic: ${id}`,
            },
          ],
        };
      }
      if (params?.name === "authenik8_upgrade_plan") {
        const directory = String(params.arguments?.directory ?? ".");
        const plan = await runUpgrade({ directory, json: true, check: false, acknowledge: false, explain: false, help: false });
        return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
      }
      if (params?.name === "authenik8_list_diagnostics") {
        return { content: [{ type: "text", text: JSON.stringify(diagnosticDefinitions, null, 2) }] };
      }
      if (params?.name === "authenik8_project_manifest") {
        const directory = String(params.arguments?.directory ?? ".");
        const manifestPath = path.join(directory, "authenik8.json");
        const content = await fs.readFile(manifestPath, "utf8");
        return { content: [{ type: "text", text: content }] };
      }
      if (params?.name === "authenik8_plan_resource_scaffold") {
        const directory = String(params.arguments?.directory ?? ".");
        const name = String(params.arguments?.name ?? "");
        const fields = parseResourceFields(String(params.arguments?.fields ?? ""));
        const withTests = params.arguments?.withTests === true;
        const withCrudUi = params.arguments?.withCrudUi === true;
        const context = await createAddContext(directory);
        const changes = await planResource(context, { name, fields, withTests, withCrudUi });
        const result = {
          planningOnly: true,
          applied: false,
          preset: context.manifest.preset,
          changeCount: changes.length,
          changes: changes.map((change) => ({
            relativePath: change.relativePath,
            operation: change.before === null ? "create" : "edit",
          })),
          applyFirst: 'npx create-authenik8-app add resource <name> --fields "<spec>" --dry-run',
          followUp: [
            "npm run build:packages",
            "npm run db:generate",
            "npm run db:migrate",
            "npm run openapi:generate",
            "npm run openapi:check",
          ],
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      throw new Error(`Unknown tool: ${params?.name ?? ""}`);
    }
    default:
      return null;
  }
}

export async function runMcpServer(): Promise<void> {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          const request = JSON.parse(line) as JsonRpcRequest;
          const result = await handleRequest(request);
          if (request.id !== undefined) {
            writeMessage({ jsonrpc: "2.0", id: request.id, result });
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32603, message: detail } });
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });
}
