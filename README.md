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

Planned (not started): `@authenik8/mcp` (identity-aware planning/validation
tools), `@authenik8/design` (design systems as data), `@authenik8/agent-adapter`
(documented runtime adapter interface), `apps/studio` growth.

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
