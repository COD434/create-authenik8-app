# @authenik8/mcp

Read-only, identity-aware Authenik8 planning and validation tools over the
[Model Context Protocol](https://modelcontextprotocol.io) (stdio). This is
ecosystem milestone M2: it turns the generator's contract assets into agent
capabilities **without** giving agents write access to anything.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_supported_features` | Enumerates supported presets, frontends, databases, runtimes, OAuth providers, auth methods, package managers — plus the spec-snapshot provenance. |
| `plan_authenik8_project` | Turns a generation request into a plan: decisions, a non-interactive CLI command (verified flags only), the `authenik8.json` contract shape, follow-up checks. Pure planning. |
| `validate_project_spec` | Validates a generation request against the preset rules and returns the normalized spec with structured, path-stable issues. |
| `get_project_contract` | Parses `authenik8.json` from a directory inside the configured workspace and returns the validated contract. |

## Boundaries (by design)

- **No write tools.** Nothing is generated, written, installed, or deployed
  through this server. Future write actions must arrive with explicit
  confirmation, receipts, and audit records.
- **Bounded reads.** `get_project_contract` reads exactly one file —
  `authenik8.json` — inside the workspace root given at startup
  (`--workspace <dir>`). Path arguments that escape the root are refused
  with a structured `outside_workspace` error. Without a workspace root,
  inspection is disabled entirely.
- **No secrets.** Environment files are never opened; manifest values only
  (the manifest contract forbids secrets); tool results never include file
  contents or environment values.
- **No network, no code execution, no shell input.**

## Spec snapshot discipline

The option enums and validation rules are a **vendored snapshot** mirrored
from the generator CLI at a recorded commit (`SPEC_SNAPSHOT` in
`src/spec.ts`). The CLI repository remains the source of truth: when its
schemas change, re-derive this snapshot and update the provenance record.
A snapshot that disagrees with CLI state or `authenik8.json` is a defect.

The manifest fixture in `tests/fixtures/` is real generator output and is
validated byte-for-byte by the mirrored schema.

## Usage

```bash
npm run build
node dist/bin.js --workspace /path/to/your/project
```

Wire it into an MCP client (example for OpenCode-style config):

```json
{
  "mcpServers": {
    "authenik8": {
      "command": "node",
      "args": ["<path>/packages/mcp/dist/bin.js", "--workspace", "."]
    }
  }
}
```

End-to-end stdio smoke against a real generated project:

```bash
node scripts/smoke-stdio.mjs <path-to-a-generated-project>
```
