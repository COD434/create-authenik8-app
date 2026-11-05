# Stage 1 — Authenik8 repository audit

Scope of this audit: the `create-authenik8-app` working tree on branch
`feat/ai-age-roadmap-inflight`. Everything below is verified against the local
repository (source inspection and the test runs recorded at the end); nothing
is inferred from memory of an older state.

## 1. What the repository is

A single npm-distributed TypeScript CLI (`create-authenik8-app`) that generates
and maintains authenticated application projects. It is not a library
monorepo: one package, one `dist/`, templates shipped inside the tarball.

Top-level layout:

```text
src/bin/        CLI entry points (cli.ts, index.ts generator entry)
src/commands/   add, doctor, lovableDoctor, ops, upgrade, studio, migrate, mcp
src/lib/        args, schemas (Zod), projectManifest, projectEngine, nonInteractive
src/steps/      prompts, createProject (staged atomic generation)
templates/      base, auth, auth-oauth, fullstack (+ Lovable integration pack)
studio/, studio-src/   local read-only security dashboard (packaged)
tests/          unit + integration suites (59 files / 474 tests via vitest)
docs/           26 documents incl. threat-model.md, migrations.md, cli-reference.md
examples/       lovable-reference
```

## 2. Existing product surface (preserve-list)

The root CLI routes: `create`, `add`, `doctor`, `doctor frontend`, `upgrade`,
`ops`, `studio`, `migrate`.

- **Generator.** Zod-validated state, single-template selection, copy through
  a staging directory, atomic move, resume support, `authenik8.json` manifest
  (schema-versioned project contract). Four presets: `base`, `auth`,
  `auth-oauth`, `fullstack`; fullstack has a frontend mode (`react` default,
  `lovable`).
- **Generated fullstack app.** Express API + Prisma/PostgreSQL + Redis;
  OpenAPI 3.1 contract covering registration, login, refresh rotation, CSRF,
  OAuth start/callback/exchange, account, sessions, projects, admin users,
  admin audit, health, JWKS; typed `@authenik8/api-client` with in-memory
  access tokens, sealed HttpOnly refresh cookie, one shared refresh + retry,
  cross-tab coordination.
- **Doctor.** Diagnostic catalog with stable `A8-*` IDs, deep/production
  checks, fix dry-run, JSON output, exit-code policy, redacted reports
  (recently extended with A8-DEV-001 local-API responsiveness and the
  run-local watcher orchestration fix).
- **Ops.** Explicit live maintenance actions with structured receipts,
  runtime checks, signing.
- **Upgrade.** Version-aware plans, explicit acknowledgement; never silently
  applies template changes over user-modified projects.
- **Studio.** Local, loopback-bound, read-only, snapshot-based assessment UI;
  GET/HEAD-only server, CSP, packaged into the tarball.
- **Migrate.** Read-only readiness reports for supabase/clerk/auth0 with
  stable pattern IDs and per-line replacement proposals.
- **MCP.** Read-only planning tools (e.g. resource-scaffold planner).
- **Supply chain.** semantic-release, provenance, pinned actions, pack
  inspection.

## 3. Architectural invariants (from AGENTS.md and verified behavior)

1. Project-local engine loading: diagnostic/ops commands load the *generated
   project's* installed `authenik8-core`, never the CLI's dev dependency.
2. `authenik8.json` is a migration-grade contract; no secrets in it.
3. Security boundaries are server-side: tokens in memory, sealed refresh
   cookie, CSRF, exact-origin, middleware authorization. No UI-role trust.
4. Read-only vs mutating command boundaries are explicit (ops mutates with
   receipts; doctor/studio/migrate never mutate).
5. The CLI repo must not absorb hosted accounts, billing, cloud deployment
   credentials, or multi-tenant state.

## 4. Reusable foundations for the ecosystem

| Asset | Ecosystem reuse |
| --- | --- |
| `authenik8-core` engine (JWT, refresh rotation, OAuth, RBAC, sessions) | Identity layer for any agent/studio/model gateway surface |
| OpenAPI 3.1 contract + typed client | The API contract any Studio/agent talks to; client already handles token lifecycle |
| Doctor catalog + JSON + exit codes | Pattern for agent "capability/diagnostic" surfaces |
| MCP planner tools | Seed of an `authenik8-mcp` server |
| Studio (loopback, snapshot, read-only) | Shell to grow toward a development environment — but read-only boundary must be extended deliberately, not casually |
| `add resource` scaffolder + recipes | Behind any future policy DSL and codegen surfaces |
| Zod schemas / manifest | The versioned project specification AGENTS.md points at |

## 5. Known gaps / technical debt observed

- Single-package layout is reaching a naming ceiling: `studio-src` vs
  `studio`, templates, and commands share one tsconfig/build pipeline.
- No workspace/pnpm structure yet for extracting `authenik8-core`-adjacent
  packages (the engine itself is a separate npm dependency, not in-repo).
- Windows CI exists for the CLI, but new ecosystem packages would each need
  the same cross-platform discipline.
- `demo/` hygiene: an untracked user project with a real `.env` sits in the
  repo root (surfaced repeatedly; still user's choice).
- The EBUSY temp-dir race in `generator.test.ts` base-server boot recurs
  under full-suite parallelism (passes isolated; root cause is a Windows
  rmdir race, not logic).

## 6. Verification record

- Branch `feat/ai-age-roadmap-inflight`, head `20df703`; 15 commits ahead of
  `main` (unpushed by user decision).
- Latest full gates on this tree: `npm run build` clean; `npm run
  test:coverage` 59 files / 475 tests (one environmental EBUSY flake passed
  22/22 isolated); `test:templates` 3/3; live doctor/migrate smokes on the
  local `demo/` project.

Next: [Stage 2 — reference research](stage-2-reference-research.md).
