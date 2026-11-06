# authenik8

Authenik8 ecosystem workspace: identity-aware AI development foundations.
Blueprint and rationale: `docs/ecosystem/` in the `create-authenik8-app`
repository (Stage 2b). This workspace grows *around* the generator CLI; the
CLI repo keeps its own contract and boundaries.

## Packages

| Package | Purpose | Status |
| --- | --- | --- |
| `@authenik8/models` | Provider-independent BYOK model gateway: discovery, streaming, usage accounting, budgets, retry | M1 — initial OpenRouter adapter |
| `@authenik8/mcp` | Read-only, identity-aware planning/validation tools over MCP stdio: `get_supported_features`, `plan_authenik8_project`, `validate_project_spec`, `get_project_contract` | M2 — read-only planning surface |
| `@authenik8/design` | Design systems as versionable data: validated tokens, DESIGN.md brand specs, WCAG contrast checks with stable IDs (`A8-DS-###`) — plus 4 agent skills (`design-audit`, `design-init`, `design-css`, `design-contrast-fix`) wired into OpenCode via the `skills` config | M3 — data format + checks + agent skills |
| `@authenik8/agent-adapter` | Documented runtime-swap contract over coding agents (OpenCode first): structured runs, timeout/abort kills, opt-in auto-approve | M4 — interface + OpenCode adapter |
| `@authenik8/web-studio` | Localhost ChatGPT-style builder: describe an app, the agent writes real files and self-audits design checks (A8-DS). BYOK free OpenRouter models, key in tab memory only, no telemetry | M5 v2 — quality loop (`docs/m5-web-studio.md`) |

Planned: `apps/studio` growth, additional runtimes behind the same
`AgentRuntime` contract, design-agent skills consuming `@authenik8/design`.

## Development

Node 22+. This workspace uses npm workspaces (the blueprint suggested pnpm;
npm was chosen for the current toolchain — equivalent for a single-package
start).

```bash
npm install
npm run build
npm run test
```

## Security posture

- BYOK only in M1: the user's provider key is passed per call, is never
  logged, never embedded in errors, and is only sent to the validated
  provider base URL (HTTPS, non-private hosts — SSRF-guarded).
- No telemetry. No platform credentials exist yet; when managed access
  arrives it will live behind a separate hosted trust boundary.
