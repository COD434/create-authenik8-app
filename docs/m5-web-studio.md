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
| v4.2 | The studio's own skin built with the workspace's own design system: `apps/web-studio/design/tokens.json` + `DESIGN.md` (validated by `runDesignChecks`; all declared contrast pairs WCAG AA), CSS generated with `renderTokensCss`, inline-SVG icons (no CDN), surface-elevation restyle with motion honoring `prefers-reduced-motion` — plus the first-run export fix: `/api/export` bootstraps a missing sandbox and returns a valid empty ZIP instead of a 500 | done |
| v4.3 | Durable session log: append-only JSONL at `.authenik8/session.jsonl`; the model-visible conversation is derived from it; `/api/history` restores the transcript; crash repair records unknown tool outcomes; cancellation keeps streamed text | done |
| v4.4 | Request-view compaction: the oldest large tool results are summarized above a configurable character budget (`AUTHENIK8_CONTEXT_CHARS`); the log stays complete; the SSE stream announces compaction | done |
| v4.5 | Runtime context: a logged project snapshot (root entries, package metadata, design and run state) is injected before the user turn and refreshed after tool rounds; `.env` values and absolute paths are never included | done |
| v4.6 | Build plan: the `update_plan` tool records a short step list in the logged assistant tool call; the sidebar shows a read-only trajectory with live SSE updates; `/api/history` derives the latest successful plan, so refresh and restart restore it; rejected or interrupted plans are ignored | done |
| v4.7 | Read-only explorer subagent: `explore_project` starts a fresh child session with only `list_files`, `read_file`, and `design_audit`; one child per turn, max 4 tool rounds, 60s timeout, 32k read budget, 6k report cap; the child transcript is append-only at `.authenik8/subagents/` and the parent receives only the report; no writes, commands, network, recursion, or key access; synchronous, so background children remain a later slice | done |
| v4.8 | Parallel read-only tools: adjacent `list_files`, `read_file`, and `design_audit` calls in one assistant message run together, at most four at a time; `write_file`, `update_plan`, `explore_project`, `review_project`, `build_project`, and unknown tools are exclusive barriers; results are logged in call order; tool SSE events carry call ids so the UI can track overlapping lines | done |
| v4.9 | Read-only reviewer subagent: `review_project` reuses the child runner with a review-focused prompt and the same allowlist and budgets; the one-child-per-turn limit is shared with `explore_project`; the child transcript is append-only at `.authenik8/subagents/review-<id>.jsonl`; the parent receives findings ordered by severity with file paths and evidence; no writes, commands, network, recursion, or key access | done |
| v5.0 | Write-capable builder subagent: `build_project` leases a sandbox-relative directory and writes only inside it; writes outside the lease, `.env*` (except `.env.example`), `.authenik8`, `.git`, and `node_modules` are rejected; the report lists the files written; the one-child-per-turn limit is shared with the explorer and reviewer; the transcript is append-only at `.authenik8/subagents/build-<id>.jsonl`; max 6 rounds, 90s, 48k tool-result chars, 16 files, 6k report; no commands, network, recursion, diff/merge, or background | done |
| v5.1 | Read-only subagent transcript viewer: the sidebar "Subagent runs" door lists explorer, reviewer, and builder logs newest first; `GET /api/subagents` returns metadata and the first task line, and `GET /api/subagents/<kind>-<uuid>` returns the parsed transcript; ids are restricted to the exact runner shape and re-checked against the real subagent directory; reads never repair or write the log; 32 MB cap; builder-sized logs are parsed and `write_file` bodies are projected to a size marker; API responses are no-store; the viewer shows the system prompt collapsed, the task, assistant text, tool calls, and tool results, with long payloads capped for display | done |
| v5.2 | Direct child transcript links: each child tool line has a "View transcript" link; live completion events include the child id; restored history pairs each child call with its logged result and child id; closing the viewer returns focus to the link that opened it | done |

### Child delegation contract (v4.7, reviewer v4.9, builder v5.0, viewer v5.1, links v5.2)

- `explore_project`, `review_project`, and `build_project` are the delegation
  tools. One child per parent turn, shared across all three.
- The child gets a fresh context (system prompt + task), never the parent log.
- Read-only children use `list_files`, `read_file`, and `design_audit`; the
  builder uses those plus `write_file`. Every other call is rejected before
  execution.
- Read-only children cannot write. The builder writes only inside its leased
  sandbox-relative directory. Writes outside the lease, `.env*` (except
  `.env.example`), `.authenik8`, `.git`, and `node_modules` are rejected. No
  child can run commands, reach the network, read `.env` files, or spawn
  another child.
- Budgets: explorer and reviewer get 4 tool rounds, 60s wall clock, 32k
  tool-result chars, and a 6k report cap. The builder gets 6 tool rounds, 90s,
  48k tool-result chars, 16 files, and a 6k report cap.
- Transcripts stay in `.authenik8/subagents/explore-<id>.jsonl`,
  `review-<id>.jsonl`, or `build-<id>.jsonl`.
- The read-only viewer reads those logs through `GET /api/subagents` and
  `GET /api/subagents/<kind>-<uuid>`. It is inspection only: opening a
  transcript never repairs or appends to the child log.
- The parent receives the report as a tool result; raw child output never
  enters the parent context. The report is evidence, not instructions.
- `explore_project` returns an investigation report. `review_project` returns
  findings ordered by severity (critical, high, medium, low) with file paths,
  evidence, and the smallest safe fix. `build_project` returns what changed,
  the files written, the checks run, and any gaps.
- Directory leases are in-memory, single-writer, and overlap-rejecting, and
  are released when the child ends. A lease conflict or invalid directory
  returns an error before a child starts and does not consume the turn slot.
  Leases do not coordinate with the separate OpenCode agent route and do not
  survive a restart.
- Background children, out-of-process children, diff/merge, and parallel
  delegation are not in this slice: the chat route is still one
  request-scoped SSE stream. The viewer is read-only and does not stream a
  running child; reopen it after the child ends.

### Subagent transcript viewer (v5.1)

- The sidebar "Subagent runs" door opens a bounded modal with the newest 50
  child logs. Each row shows the child role, the first task line, size,
  modification time, and a short child ID; the hint states the 50-run cap.
- The list endpoint stats and sorts candidate files first, then reads task
  previews only for the newest 50. A large backlog does not multiply head
  reads.
- `GET /api/subagents` returns metadata only. `GET /api/subagents/<id>` returns
  the parsed messages from one log.
- The id must match `(explore|review|build)-<uuid>` exactly. The real
  subagents directory must resolve to the `subagents` child of the real
  `.authenik8` directory, and the resolved file is checked against it. A
  symlink, junction, or path traversal cannot turn a list or transcript
  request into an arbitrary read.
- Transcript reads use a separate read-only parser. Unlike the parent session
  log, they never append synthetic repair results for interrupted tool calls.
- Logs larger than 32 MB return metadata with `truncated: true` instead of
  being parsed into the response. The viewer shows the task preview and
  metadata for those logs. Builder-sized logs are parsed; `write_file` bodies
  are projected out of the response as a size marker, so the viewer stays
  small while the full body remains in the raw log. The UI caps other long
  tool payloads at 12,000 displayed characters.
- API responses are `cache-control: no-store`, matching the static shell. The
  viewer is same-origin and localhost-only; it does not add a new network
  boundary or expose logs to the project preview or export.
- Opening the viewer moves focus into the dialog, traps Tab inside it, and
  makes the rest of the shell inert. Closing restores focus to the control
  that opened it: the sidebar door or a child tool line. A transcript load
  failure sets an "Unavailable" status and keeps focus on the Back control.
- Child tool lines include a "View transcript" link. Live completion events
  carry the child id; restored history pairs each child call with its logged
  result and child id, so the link survives a refresh. The child id is stored
  as local viewer metadata on the parent tool result and is not sent to the
  model.
- Not included: live child progress, background children, search or filtering,
  log deletion/pruning, and diff/merge. The parent transcript still shows one
  tool line per child call, now with a direct transcript link.

### Tool scheduling contract (v4.8)

- Adjacent read-only calls (`list_files`, `read_file`, `design_audit`) share a
  batch and run concurrently, at most four at a time.
- `write_file`, `update_plan`, `explore_project`, `review_project`,
  `build_project`, and unknown tools are exclusive barriers. They run alone
  and in call order, so a read that follows a write observes the write.
- Results are appended to the session log in call order, not completion order.
- Tool start and done events carry the model's call id; the UI matches lines by
  id, not by name.
- Cancellation before a batch records undispatched calls as unknown, as before.

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
