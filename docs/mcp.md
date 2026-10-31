# Authenik8 MCP server

`create-authenik8-app mcp` starts a minimal Model Context Protocol server over
standard input/output. It exposes read-only project diagnostics to AI agents:

- `authenik8_doctor_offline` runs the offline Doctor checks for a project directory.
- `authenik8_explain_diagnostic` explains a stable `A8-*` diagnostic ID.
- `authenik8_list_diagnostics` lists all diagnostic definitions.
- `authenik8_project_manifest` reads the source-controlled `authenik8.json` manifest.
- `authenik8_upgrade_plan` generates an upgrade plan for a project directory.

The server uses JSON-RPC 2.0 and binds only to the local process standard
streams. It never reads `.env` values or secrets; Doctor runs in offline mode.

Example client configuration:

```json
{
  "mcpServers": {
    "authenik8": {
      "command": "npx",
      "args": ["create-authenik8-app", "mcp"]
    }
  }
}
```

This is an initial scaffold. Future versions will add project generation,
upgrade planning, session revocation, and signing-key rotation tools.

[Back to the documentation index](../README.md#documentation)
