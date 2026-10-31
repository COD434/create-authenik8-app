# AI-Age Roadmap: Making Authenik8 indispensable

**Status:** Draft planning document
**Audience:** Maintainers, contributors, product
**Related:** [Roadmap](roadmap.md), [Why create-authenik8-app](why-create-authenik8-app.md), [Lovable integration](lovable.md)

## Problem statement

`create-authenik8-app` already ships a security-first identity/backend generator
(Express + TypeScript, rotating JWTs, Redis-backed sessions, Prisma, RBAC, OAuth,
fullstack React kit, Lovable integration, Doctor, Studio, upgrade/ops receipts).
It is **not** a BaaS; its thesis is:

> Vibe-code the interface. Keep identity on a backend you own.

Supabase wins adoption on **friction and ecosystem**: instant Postgres/Auth/Storage/Realtime,
a dashboard, SDKs for every framework, and deep AI-tool integration (MCP/prompts).
Authenik8's gap is not auth quality - it is **DX, ecosystem breadth, AI-native
ergonomics, and time-to-wow**.

## Goal

Make "not using Authenik8" feel like missing out by turning it into the **default,
AI-native, owned-backend foundation** that Supabase users reach for when they
outgrow BaaS lock-in - while preserving its security posture.

## Phase 1 - Time-to-wow & zero friction (0-6 weeks)

1. **One-command, batteries-included dev.** `npx create-authenik8-app` -> `npm run dev`
   already provisions project-local Postgres + in-process Redis. Make the first run
   print a **live URL, admin creds, and a "try it" curl**. Add `--demo` seeding a
   sample app with users/roles/data so value is visible in 60s.
2. **AI-native scaffolding prompts.** Ship first-class instruction files in every
   generated project: `.cursorrules`, `CLAUDE.md`, `.github/copilot-instructions.md`,
   Windsurf rules, plus a reusable `AGENTS.md` contract. Make AI editors "know"
   Authenik8 conventions out of the box.
3. **Framework adapters beyond React/Vite.** Add Next.js (App Router), Remix,
   SvelteKit, Nuxt, Astro, and Expo/React Native clients sharing the same typed
   `api-client` package. Supabase's SDK breadth is its moat; match it.
4. **Instant deploy.** `authenik8 deploy` (or generated `deploy:*` scripts) for
   Railway, Fly.io, Render, Vercel (API as serverless), with an env/secrets wizard
   and a `doctor --production` gate. Docker Compose already exists; make it the
   default happy path.

## Phase 2 - AI control plane (6-12 weeks)

5. **Authenik8 MCP server** (lovable.md already hints at it). Expose tools to AI
   agents: `generate_project`, `run_doctor`, `apply_upgrade`, `revoke_session`,
   `rotate_signing_key`, `add_resource`, `add_role`, `add_oauth_provider`,
   `explain_diagnostic`. This is the single biggest "missing out" lever - Supabase's
   MCP is a major adoption driver.
6. **Live Studio (actions, not just read-only).** Keep the offline snapshot for
   security, but add an opt-in **dev-mode control plane** (localhost, gated by a
   local token) for session revocation, user/role management, migration runner,
   env wizard, key-rotation preview, and audit-log viewing. This is the "Supabase
   dashboard" equivalent, self-hosted.
7. **Prompt-to-feature generation.** Extend the existing `add` command with
   AI-assisted scaffolding: `authenik8 add resource Invoice --fields "amount:number,status:enum" --with-crud-ui --with-tests`
   generates the Prisma model, Zod contract, API routes, policies, typed client,
   React screens, tests, and OpenAPI. Converts hours of boilerplate into one command.
8. **AI-assisted upgrades/migrations.** `upgrade --explain` uses the manifest + diff
   to produce a human-readable migration plan and codemods; `--apply-safe` for
   non-breaking changes. Reduces fear of upgrading.
## Phase 3 - Feature parity for the AI era (3-6 months)

9. **Passkeys/WebAuthn + MFA first** (roadmap already lists WebAuthn/MFA).
   Prioritize phishing-resistant passkeys - critical in the AI era (agent
   impersonation, phishing). Add device trust, step-up auth, and "login with
   passkey" UI.
10. **Agent & service identity.** First-class **API keys, service accounts, scopes,
    token exchange (RFC 8693), and MCP OAuth** so Authenik8 becomes the identity
    layer for AI agents/tools, not just humans. A differentiator Supabase doesn't
    own.
11. **Multi-tenancy & orgs.** Organizations, membership, invitations, org
    switching, org-scoped RBAC, billing hooks (Stripe scaffold). Most SaaS needs
    this; shipping it as a primitive is a "missing out" trigger.
12. **Storage & realtime primitives.** Pluggable file storage (S3/R2/local) with
    signed URLs + image transforms; SSE/WebSocket channels with auth-aware
    subscriptions. Start with events/webhooks.
13. **Policy/RLS-like DSL.** Declarative resource policies
    (`policy("Project").ownerOrRole("admin")`) compiled to middleware + tests +
    OpenAPI, so AI can generate and verify authorization correctly.

## Phase 4 - Ecosystem & "missing out" psychology (ongoing)

14. **Supabase/Clerk/Auth0 migration guides + codemods.**
    `authenik8 migrate from supabase` imports schema/users where feasible and maps
    auth calls. Lowers switching cost.
15. **"Authenik8 Certified" badge + GitHub Action.** PR comment with doctor
    findings, coverage, and a badge for clean projects. Social proof + CI
    integration = adoption.
16. **VS Code extension.** Diagnostics inline, "fix with Authenik8" code actions,
    template snippets, project graph. Supabase has this; parity matters.
17. **Showcase & templates.** Gallery of apps built with Authenik8, starter
    templates (SaaS, AI chat app, marketplace, internal tool), and "clone this"
    one-liners.
18. **Community plugin registry.** Auth strategies (SAML, enterprise OIDC),
    email/SMS providers, storage backends, payment providers - contributed and
    versioned.

## Positioning & messaging (why not Supabase?)

- **Owned, portable, auditable identity:** no vendor lock-in, self-host anywhere,
  full source control of auth logic, signed receipts/audit trails - critical for
  regulated/AI-heavy products.
- **AI-safe by construction:** server-side authorization boundary, strict cookies,
  CSRF/Origin checks, replay protection, offline doctor, no secrets in client.
  AI-generated UI can't accidentally weaken auth.
- **Agent-ready:** identity for humans *and* AI agents (keys, scopes, token
  exchange, MCP OAuth).

## Risks / assumptions

- Scope creep: keep PRs small per `AGENTS.md`; each item should be one narrow PR.
- Don't weaken security to chase friction (no hosted console inside the CLI, no
  disabling CSRF/cookies).
- MCP/live Studio must preserve the offline security boundary (no secrets read,
  localhost-only, no telemetry without consent).
- Framework adapters must reuse the existing typed client, not fork it.

## Recommended first 3 PRs (smallest high-leverage)

1. Ship AI editor instruction files + a "60-second demo" seed in generated projects.
2. Publish an **Authenik8 MCP server** (read-only doctor + generate first) behind
   a feature flag.
3. Add a **Next.js adapter** + `--frontend next` to prove multi-framework parity.

## Success metrics

- Time-to-first-working-app < 2 min; time-to-first-protected-route < 5 min.
- MCP tool usage in AI editors; Studio daily active projects.
- Migration guide traffic from Supabase/Clerk docs.
- GitHub stars / npm downloads growth; "built with Authenik8" showcase count.

[Back to the documentation index](../README.md#documentation)

