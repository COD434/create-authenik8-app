# Stage 2b — Recommended architecture, MVP plan, and roadmap

Deliverables 4–10 of the first assignment. Prerequisites:
[Stage 1 audit](stage-1-repository-audit.md) ·
[Stage 2 research](stage-2-reference-research.md).

## 1. Recommended architecture (deliverable 5)

A **modular monolith evolving into a pnpm workspace**, with the existing CLI
repo preserved as one package among several. Principle: the CLI repo's
AGENTS.md boundaries are not relaxed — the ecosystem grows *around* it, and
anything hosted lives behind a separate trust boundary.

```text
                    ┌───────────────────────────────┐
                    │        authenik8-core         │
                    │  identity engine (existing)   │
                    │  JWT · rotation · OAuth · RBAC│
                    └──────────────┬────────────────┘
                                   │  (the only trust anchor)
        ┌──────────────┬───────────┴────────┬───────────────────┐
        │              │                    │                   │
┌───────▼──────┐ ┌─────▼──────┐ ┌───────────▼────────┐ ┌───────▼────────┐
│  generator   │ │authenik8-  │ │  authenik8-models  │ │ authenik8-     │
│  CLI (this   │ │mcp         │ │  BYOK gateway lib: │ │ design (data:  │
│  repo, keeps │ │ read-only  │ │  provider adapters,│ │ DESIGN.md,     │
│  its contract│ │ planning + │ │  streaming, usage  │ │ tokens.css,    │
│  + its users)│ │ validation │ │  accounting hooks  │ │ templates)     │
└───────┬──────┘ └─────┬──────┘ └───────────┬────────┘ └───────┬────────┘
        │              │                    │                   │
        └──────────────┴─────────┬──────────┴───────────────────┘
                                 │ MCP (tools + skills)
                    ┌────────────▼─────────────┐
                    │     agent runtime        │
                    │  OpenCode (MIT) first;   │
                    │  adapter interface so    │
                    │  other agents can serve  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Studio (existing local  │
                    │  UI, grown deliberately) │
                    └──────────────────────────┘
```

Key decisions, each with its reason:

1. **Do not build an agent engine.** OpenCode is MIT, mature, extensible via
   MCP/agents/plugins, and already the harness this very workflow runs in.
   Authenik8's agent capability = `authenik8-mcp` tools + skills loaded into
   OpenCode. An `agent-adapter` interface is documented so a runtime swap
   (or our own loop later) is possible without rewrites. *Borrowed from
   OpenDesign:* their entire product orchestrates agents they did not write.
2. **Identity stays the differentiator.** The MCP server exposes
   identity-aware planning: "scaffold a protected route", "add a resource
   with ownership policy", "validate this app's session posture" — backed by
   the real `authenik8-core` contract. No other agent ecosystem has this.
3. **Design intelligence is data, not code.** Independent implementation of
   OpenDesign's best lesson: design systems as versionable directories
   (`DESIGN.md` + `tokens.css` + component specs) that *any* agent reads.
   Consistency checks start as read-only doctor-style diagnostics.
4. **Models: BYOK gateway library first.** Provider adapters with streaming,
   capability metadata, usage tracking, cost estimation, retry policies, and
   server-side accounting hooks. Managed credits = a hosted
   `authenik8-platform` service later (separate trust boundary, per
   AGENTS.md); platform keys never reach clients.
5. **Studio grows; it does not fork.** Today: local, loopback, read-only,
   snapshot-based. Ecosystem path: agent activity and approvals render
   through the MCP/OpenCode contract; any write-action in Studio arrives
   only as explicit, receipted commands (ops pattern).

## 2. Proposed repository structure (deliverable 6)

New `authenik8` workspace (this stays out of `create-authenik8-app`; that
repo only gains docs and, later, extracted versioned specs):

```text
authenik8/
├── packages/
│   ├── contracts/        # Zod schemas shared by mcp/models/design (versioned spec)
│   ├── mcp/              # authenik8-mcp: planning + validation tools (read-only first)
│   ├── models/           # gateway lib: adapters, streaming, usage accounting
│   ├── design/           # design-system dirs, tokens, templates, consistency checks
│   └── agent-adapter/    # documented adapter interface over coding-agent runtimes
├── skills/               # Agent Skills (SKILL.md) that load Authenik8 know-how into agents
├── apps/
│   └── studio/           # migrated/grown Studio when it outgrows the CLI repo
├── templates/            # link/dependency on create-authenik8-app templates
└── docs/
create-authenik8-app/     # UNCHANGED repo: generator CLI + doctor + ops + studio v1
```

Extraction order (respecting "manifest changes are migrations"): contracts
first, then `mcp`, `models`, `design`; the generator CLI follows only when a
demonstrated need exists.

## 3. MVP implementation plan (deliverable 7)

Stage 4's MVP, mapped to build/reuse:

| # | MVP capability | Plan |
| --- | --- | --- |
| 1 | Open an existing project | OpenCode native; `authenik8-mcp` tools run in any project dir |
| 2 | Connect to OpenRouter | `authenik8-models` adapter #1, BYOK key from env/config, never logged |
| 3 | Select a free model | Model discovery + capability metadata; pinned defaults |
| 4 | Converse with a coding agent | OpenCode TUI/desktop — nothing to build |
| 5 | Read project files | OpenCode native tools |
| 6 | Edit project files | OpenCode native tools (permission-gated) |
| 7 | Approved terminal commands | OpenCode permission model + our rule: no destructive auto-exec |
| 8 | Review code changes | OpenCode review flow; diff-first tool outputs |
| 9 | Run project tests | `build-test` signal pattern (OpenDesign lesson) as a skill |
| 10 | Authenik8 integration first-class | `authenik8-mcp` planning/validation tools + doctor integration |
| 11 | Design intelligence (small) | 3–5 skills: design-system scaffold, tokens, page spec against DESIGN.md |

MVP = M1+M2 in the roadmap below; it deliberately contains **no** new UI
beyond OpenCode's.

## 4. Technology recommendations (deliverable 8)

- **Language:** TypeScript everywhere (strict; Zod at every external
  boundary — mirrors both reference projects and the existing repo).
- **Runtime:** Node 22+ LTS for packages; OpenCode handles its own Bun
  packaging. No new native deps until justified (note OpenDesign's
  better-sqlite3/node-pty/sharp choices — adopt lazily).
- **Package manager/workspace:** pnpm workspaces.
- **MCP:** stdio servers, JSON-schema-narrowed tools; skills per the Agent
  Skills convention (both references converge on this).
- **Testing:** vitest; contract tests for the models gateway; doctor-style
  fixture pairs (secure/insecure) for design checks.
- **Release:** semantic-release + provenance (match the existing CLI's
  supply-chain posture).

## 5. Licensing and dependency considerations (deliverable 9)

- OpenCode **MIT**, OpenDesign **Apache-2.0**: both permit our integration
  and independent implementation. We copy no source; we implement documented
  concepts. Apache-2.0's patent grant favors ecosystem interop.
- Trademark/courtesy: don't name packages after the reference projects;
  OpenCode explicitly requests unaffiliation notes for name-derived
  projects — our naming (`authenik8-*`) avoids this entirely.
- OpenRouter/pricing: treat pricing, free-model availability, and terms as
  volatile — encode them as data with retrieval dates, never as constants.
- Never ship telemetry ingestion keys or platform credentials in artifacts
  (the cautionary example observed in a shipped config was noted in Stage 2).

## 6. Prioritized roadmap (deliverable 10)

- **M0 (this document set).** Audit + research + blueprint. ✅
- **M1 — Models MVP.** `authenik8-models` BYOK: OpenRouter adapter, discovery,
  streaming, usage accounting lib + tests.
- **M2 — Agent integration.** `authenik8-mcp` (read-only: plan/validate/
  contract) + first Authenik8 skills; runs inside OpenCode against a
  generated fullstack app; approval boundaries documented.
- **M3 — Design intelligence.** `authenik8-design` data format + 3–5 skills +
  consistency checks (doctor-style, stable IDs).
- **M4 — Studio growth.** Surface agent activity/tool approvals through
  existing Studio contracts; still loopback + explicit actions.
- **M5 — Managed access.** Hosted `authenik8-platform` (accounts, credits,
  metering) behind a separate boundary; South Africa pricing pilot.
- **M6 — Agency workspaces.** Only after the developer experience is proven.

## 7. Recommendation: fastest technically sound path to MVP (deliverable summary)

**Adopt OpenCode as the agent runtime, and spend Authenik8 engineering
exclusively on what differentiates us: identity-aware MCP tooling, the
models gateway, and design intelligence as data.** Concretely, M1 → M2 in
that order: the models gateway is self-contained and immediately useful, and
the MCP server turns the existing `authenik8-core`/doctor/contract assets
into agent capabilities without touching the generator repo's guarantees.
This path reuses two MIT/Apache ecosystems for orchestration and UI, keeps
every security boundary server-side, and ships a working, honest MVP in
weeks — not the months a from-scratch agent plus desktop shell would cost.

Known limitations of this study: evidence for OpenDesign derives from the
shipped v0.24.1 artifact, its live MCP surface, and its public README, not a
full source review; OpenCode internals derive from its README, docs, and
observed runtime behavior, not source-level review; neither affects the
architecture decisions above, both are stated per the evidence discipline.
