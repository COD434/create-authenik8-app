# M5 — Studio Web: the Lovable-style builder on Authenik8

## Thesis

> Vibe-code the interface. Keep identity on a backend you own.

Studio Web gives freelancers and web agencies a ChatGPT/Claude/Kimi-style
chat interface that BUILDS — describing an app in plain language and
producing a secure Authenik8 project in moments. Lovable's time-to-wow,
but the generated app ships with rotating JWTs, server-side sessions, RBAC,
and audit trails instead of a second users table.

## Trust boundary (deliberate)

- **Localhost-only**: the server binds `127.0.0.1`. There is no hosted
  deployment in this workspace — a hosted platform (accounts, billing,
  hosted keys) is a separate trust boundary per the ecosystem rules, the
  same way the CLI repo forbids absorbing it.
- **BYOK, zero storage**: the user's OpenRouter key is sent per request in
  a header, held in the browser tab's memory only, and passed through to
  OpenRouter. The server never persists, logs, or echoes it (the models
  package's redaction discipline covers errors). The agent endpoint does
  not accept the key at all — OpenCode uses its own auth.
- **Free models first**: model discovery filters to free-tier, tool-capable
  models by default, so the builder experience costs nothing up front.
  The user's key is still required (OpenRouter free tier needs an account).
- **Agent runs are user-triggered**: the chat model cannot spawn the
  OpenCode build agent. The user clicks "Build with agent"; the run is
  auto-approved (required for unattended work) and scoped to the sandbox
  cwd. Agent output is untrusted data, rendered as plain text only.
- **No telemetry**: no request logging beyond the startup line.

## Slice roadmap

| Slice | Delivers | Status |
| --- | --- | --- |
| v0 | Chat vertical: static UI + SSE streaming over `@authenik8/models` against free models, doctrine system prompt | done (`69e05d7`) |
| v1 | Tool loop: M1 tool-call deltas + sandboxed `write_file`/`read_file`/`list_files` tools (path-scope guard, size caps, failure-as-data) → the chat writes real files | done (`d641261`) |
| v2 | Quality loop in-chat: `design_audit` tool runs `@authenik8/design` checks (A8-DS-001..004); the model fixes failed checks and re-runs | done (`ec789c4`) |
| v3a | Live preview: sandbox served read-only at `/preview/` (path-guarded, dotfile-blind), sandboxed-iframe pane in the UI → what the model builds is visible in moments | done (`c724601`) |
| v3b | Full generation: user-triggered OpenCode build agent (via `@authenik8/agent-adapter`) runs auto-approved in the sandbox cwd, outcome streamed as data | done (`ba9c76f`) |
| v4 | Export + run: `GET /api/export` streams the sandbox as a ZIP (hand-rolled STORE-method writer, OS-verified; dotfiles and node_modules excluded); `POST /api/run` boots the project with FIXED commands (`node npm-cli.js install` → `start`, no shell, argv-only) with SSE output and `POST /api/run/stop` process-tree kill | done (`3e54c27`) |
| v4.1 | Live agent events: M4 NDJSON pass-through (`AgentRunRequest.onEvent`, parsed per line with drop-malformed/oversized + flood cap) relayed as SSE `agentEvent` — the Build modal shows runtime progress in real time instead of freezing | done (`0e68d03`) |

## Live smoke — real OpenCode drive (2026-11-07, v2.0.27)

Two small runs against the real CLI (raw probe + full studio `/api/agent`
drive in a throwaway sandbox). Findings, all fixed in this slice:

- **Verified end-to-end**: raw NDJSON shapes are `{type: step_start |
  tool_use | step_finish | text, timestamp, sessionID, part}` — every line
  parsed and relayed (34 SSE events: 31 live + start/done), session id
  extracted, exit 0, preview served the built `index.html`. The agent
  followed the doctrine preamble and produced an Authenik8-style project.
- **Defect — ambiguous ENOENT**: spawn with a nonexistent cwd reports
  `runtime_missing` (indistinguishable error code). Fixed: `spawnAgent`
  pre-flights cwd existence and returns the new structured `bad_cwd` code.
- **Defect — unbootstrapped sandbox**: the studio passed a nonexistent
  sandbox root as the agent/npm cwd. Fixed: agent and run routes
  `mkdir(recursive)` the sandbox before spawning.
- **Defect — wrong status**: malformed JSON bodies returned 500. Fixed:
  agent and chat routes return 400 `Invalid JSON body`.

## Non-goals

- No hosted accounts, billing, or platform credentials in this workspace.
- No tokens-in-storage: the UI holds the key in memory only, and Authenik8
  app-identity rules (sealed cookies, in-memory access tokens) still apply
  to anything the studio BUILDS.
