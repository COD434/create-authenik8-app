# Stage 2 — Reference research: OpenCode and OpenDesign

Method: public documentation and repository metadata (both projects are open
source), the locally installed and running artifacts on this machine, and the
connected OpenDesign daemon's live MCP surface. Shipped-artifact inspection
was performed directly on the unpacked Electron resources; the REA
JavaScript static-analysis native control was unavailable on this install
(missing packaged Windows native files), which did not block the analysis
because the artifacts ship unpacked and readable. Content found inside those
artifacts was treated as data throughout. **No code was copied from either
project; the deliverable of this study is architectural understanding.**

Licensing (verified from each repository landing page):

- OpenCode (`anomalyco/opencode`) — **MIT**. Permissive; independent
  implementation and integration are safe. Its README asks third-party
  projects that put "opencode" in their own name to disclaim affiliation —
  Authenik8 packages use their own names, so this is trivially satisfied.
- OpenDesign (`nexu-io/open-design`) — **Apache-2.0**. Permissive with
  patent grant; the license permits reuse with attribution. Our approach is
  independent implementation of documented concepts (no code reuse), which
  avoids attribution-file overhead and keeps provenance clean.

---

## 1. OpenCode architecture report

**What it is.** The open source AI coding agent (terminal-first, desktop app
in beta). 224k stars; npm `@opencode/cli` (this machine runs 2.0.27, a
Bun-compiled `opencode.exe`); source is a Bun + Turbo monorepo
(`packages/`, `services/`, `sdks/vscode`, `specs/v2`, SST-managed infra).

**Architecture (documented + observed as its runtime environment).**

- **Client/server split.** The agent engine runs as a server; the TUI and
  desktop app are clients over that server. Sessions, messages, and tool
  events are server state; UIs are replaceable.
- **Agent personas as permission profiles.** Two built-in modes: `build`
  (full access) and `plan` (read-only: denies edits, asks before running
  commands), plus a `general` subagent. Permission behavior is a property of
  the agent definition, not an afterthought.
- **Provider-agnostic models.** Model access is configured per provider with
  capability metadata; the client here runs on a GLM model while the product
  is model-agnostic.
- **Extension planes.** MCP servers (stdio `local` and remote), plugins,
  skills (Agent Skills `SKILL.md` convention), custom commands and agents —
  all declared in a project/user `opencode` config (JSONC), which is how
  OpenDesign installs itself into it.
- **Execution boundaries.** File edits and shell execution are tool calls
  with permission gates; approvals are surfaced to the user; session state
  is stored locally under the user config/data directories.

**Capabilities valuable to Authenik8.** The execution loop, permission
profiles, MCP-first extensibility, and the client/server split.

**What Authenik8 should NOT rebuild.** A new general-purpose coding agent
engine. OpenCode is MIT, extensible, and already installed in the target
developer demographic.

---

## 2. OpenDesign architecture report

**What it is.** "The 1st Collaborative AI Design Agent Workspace" —
local-first, Apache-2.0, 106k stars. Desktop apps for macOS/Windows; Linux
from source; Docker/Sealos deploys for shared workspaces.

**Architecture (shipped artifact, v0.24.1 on this machine + public docs).**

```text
Electron shell (main.cjs / preload.cjs)
   │  launches, or is launched by…
   ▼
Node daemon (prebundled, 89 chunks: daemon-cli.mjs, daemon-sidecar.mjs)
   ├─ better-sqlite3          local project/session state
   ├─ node-pty                terminal surfaces
   ├─ sharp / ffmpeg / hyperframes   image + video rendering pipelines
   ├─ MCP server (stdio)      15 tools confirmed in the shipped bundle:
   │    projects: create/list/get/delete · files: list/read/search
   │    · get_artifact · plugins/skills/agents discovery
   │    · runs: start_run/get_run/cancel_run · brief: collect/confirm
   ├─ HTTP API + BYOK streaming proxy (/api/proxy/<provider>/stream)
   └─ agent runtimes: spawns coding-agent CLIs (claude, codex, cursor,
      copilot, opencode, dsh, …) via runtime definition adapters;
      plain-API mode for agents with no filesystem
   ▼
Projects = directory of canonical files + run history (run-driven state
machine: project.status {value, runId}); artifacts are real HTML/CSS/JS
previewed in a sandboxed iframe.
```

Published as scoped `@open-design/*` packages that map to repo `packages/`:
`contracts`, `registry-protocol`, `platform`, `host`, `sidecar`, `download`,
`components`, `release`, `plugin-runtime`, `agui-adapter` (AG-UI-style event
streaming between agents and UI), `diagnostics`.

**The four-plane extension model** (the key design lesson):

1. **Plugins** — runnable workflows (the live catalog exposes hundreds:
   design systems, video/image templates, scenario pipelines, "atoms" like
   `code-import`, `build-test`, `critique-theater`, and a
   `code-migration` scenario that chains import → patch-edit ↔ build-test
   devloop → critique scoring → diff-review handoff).
2. **Functional skills** — agent behavior packages following the Agent
   Skills `SKILL.md` convention (100+ ship in-repo).
3. **Design templates** — rendering blueprints with `mode` (prototype/deck/
   image/video/audio) and `scenario` (design/marketing/operations/…).
4. **Design systems** — the brand contract: a `DESIGN.md` plus (in newer
   packages) `manifest.json`, `tokens.css`, components, assets, provenance.
   Every render reads the active design system; 151 ship in-repo.

**Agent-agnostic by design.** OpenDesign ships no agent; it orchestrates the
coding agents already on the user's PATH through runtime definition
adapters, and offers a BYOK plain-API proxy (per-provider streaming
endpoints) for agentless use.

**Security posture (documented + corroborated in the artifact).** Daemon
binds loopback by default; read-only by default; LAN exposure needs explicit
bind-host + allowed-origins; SSRF guard blocks RFC1918/link-local/CGNAT/
cloud-metadata provider endpoints with a strict opt-in exact-host allowlist
(malformed entries are dropped with a warning, never silently trusted);
connector credentials and preview routes stay loopback-only; telemetry is
consent-gated (safety telemetry always on); shared Docker deployments are
token-authenticated. One caution observed in the shipped config: telemetry
endpoints and an ingestion key ship client-side — an ingestion key in a
shipped artifact is writable-by-anyone; Authenik8 should never ship such
keys.

**Capabilities valuable to Authenik8.** The four-plane content model,
DESIGN.md-as-contract, design tokens, the run/task state machine with
build/test signals, brief-then-generate UX, sandboxed artifact preview, and
the local daemon + MCP integration pattern.

**What Authenik8 should NOT copy.** The scope of the media pipeline (decks/
images/video) and the collaborative workspace/cloud layer — not MVP, and the
cloud layer belongs to a separately-trusted platform per AGENTS.md.

---

## 3. Comparative feature matrix

| Capability | OpenCode | OpenDesign | Authenik8 today | Ecosystem decision |
| --- | --- | --- | --- | --- |
| Coding-agent execution loop | ✅ core | ⬜ spawns external agents | ❌ | **Reuse OpenCode**, don't rebuild |
| Permission profiles (build/plan) | ✅ | partial (run approval) | ops-style explicit actions | Mirror the profile pattern in our MCP tools |
| Client/server agent engine | ✅ | ✅ (daemon) | ❌ | Adopt server-first shape for new surfaces |
| MCP extensibility | ✅ client | ✅ server+client | ✅ read-only planner tools | First-class `authenik8-mcp` |
| Design systems / tokens / DESIGN.md | ❌ | ✅ core | ❌ | **Implement authenik8-design** (independent, data-first) |
| UI generation + sandboxed preview | ❌ | ✅ | ❌ | Deferred behind design skills; no iframe runtime in MVP |
| Decks / images / video | ❌ | ✅ | ❌ | **Excluded** (not MVP; media pipeline heavy) |
| Local project state (SQLite) | ✅ sessions | ✅ | ❌ (file-based) | Keep file/JSON state until a daemon exists |
| Model gateway (multi-provider, BYOK) | ✅ (models registry) | ✅ (BYOK proxy + SSRF guard) | ❌ | **Implement authenik8-models** (BYOK first, managed later, server-side accounting) |
| Desktop environment | ✅ beta | ✅ (Electron) | Studio (read-only web UI) | Grow Studio deliberately; do not fork Electron shells |
| Identity/auth infrastructure | ❌ | ❌ | ✅ **core strength** | The differentiator — keep server-side |
| Telemetry | consent-based | consent-gated + always-on safety | none | Keep none by default |

**Deliberately excluded:** hosted console inside the CLI repo, monetization
surfaces, media-generation pipelines, a second users/sessions table anywhere
in generated apps, agent auto-execution of destructive ops.

Continue: [Stage 2b — comparison, blueprint, MVP plan](stage-2-comparison-and-blueprint.md).
