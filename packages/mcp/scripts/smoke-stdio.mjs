/**
 * stdio smoke test: spawns the built server binary and drives it with a real
 * MCP client over stdio against a real Authenik8 project directory.
 *
 *   node scripts/smoke-stdio.mjs <path-to-a-generated-project>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const workspace = process.argv[2];
if (!workspace) {
  console.error("usage: node scripts/smoke-stdio.mjs <workspace-dir>");
  process.exit(2);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../dist/bin.js", import.meta.url)), "--workspace", workspace],
});
const client = new Client({ name: "authenik8-mcp-smoke", version: "0.0.0" });
await client.connect(transport);

const text = (result) => result.content[0].text;

const tools = await client.listTools();
console.log("tools:", tools.tools.map((tool) => tool.name).sort().join(", "));

const features = JSON.parse(text(await client.callTool({ name: "get_supported_features" })));
console.log("features.ok:", features.ok, "| presets:", features.supported.presets.join("/"));

const contract = JSON.parse(text(await client.callTool({ name: "get_project_contract", arguments: { root: "." } })));
console.log("contract.status:", contract.status);
if (contract.manifest) {
  console.log("contract.preset:", contract.manifest.preset, "| db:", contract.manifest.database, "| frontend:", contract.manifest.features.frontend);
}

const escape = JSON.parse(text(await client.callTool({ name: "get_project_contract", arguments: { root: "../" } })));
console.log("escape blocked:", escape.code === "outside_workspace");

const plan = JSON.parse(text(await client.callTool({
  name: "plan_authenik8_project",
  arguments: { projectName: "smoke-app", preset: "fullstack", frontend: "next", authMethods: ["password", "google"] },
})));
console.log("plan.ok:", plan.ok);
console.log("plan.command:", plan.plan.suggestedCommand);

const invalid = JSON.parse(text(await client.callTool({
  name: "validate_project_spec",
  arguments: { projectName: "smoke-app", preset: "auth-oauth", database: "postgresql" },
})));
console.log("validate invalid spec → issues:", invalid.issues.map((issue) => issue.path).join(","));

await client.close();
console.log("SMOKE OK");
