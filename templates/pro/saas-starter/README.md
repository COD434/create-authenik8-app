# Authenik8 SaaS Starter (Pro)

A production-shaped starting point for a SaaS product: password auth, a
dashboard, owned projects, account settings, administrator tools, audit history,
and three demo projects. It is generated from the hardened Authenik8 full-stack
template, so the identity and authorization boundaries stay server-side.

## What is included

- React, TypeScript, and Vite frontend with a landing page, dashboard, project
  workspace, account settings, and admin pages.
- Express API with registration, login, refresh rotation, logout, password
  recovery, email verification, OAuth hooks, sessions, roles, audit events, and
  owned project policies.
- PostgreSQL with Prisma migrations and a seed administrator.
- Redis-compatible session state. Local development uses the in-process adapter;
  production requires a real Redis service.
- Three demo projects after the first seed because `SEED_DEMO=true`.
- A typed API client that keeps access tokens in memory and uses the HttpOnly
  refresh cookie.
- An OpenAPI 3.1 contract and a Doctor-ready project manifest.

## Generate

```bash
npx create-authenik8-app@latest my-saas \
  --yes \
  --preset fullstack \
  --frontend react \
  --database postgresql \
  --prisma \
  --no-oauth \
  --demo \
  --no-git
```

This configuration is password-only. The OAuth routes and hooks remain
available when you add provider credentials later.

Or use the Authenik8 Studio template picker and choose the SaaS starter card.

## Run locally

```bash
npm run dev
```

The command starts project-local PostgreSQL, applies the migration, seeds the
administrator and demo projects, and starts the API and web watchers. Open
`http://localhost:5173`.

The generated `.env` contains development values. It is ignored by Git. Read
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env`, sign in, and change the
password immediately. Do not commit `.env` or paste its contents into chat.

## Demo data

The seed creates:

- one workspace administrator;
- one `Launch workspace` project;
- three `Demo project` rows because `SEED_DEMO=true`.

To start without demo data, remove `SEED_DEMO=true` from `.env` and reset the
development database, or delete the three demo projects from the dashboard. The
demo rows are ordinary project records. They do not bypass policies.

## Customize the product

- Brand and landing copy: `apps/web/src/pages/LandingPage.tsx`
- App shell and navigation: `apps/web/src/components/AppShell.tsx`
- Dashboard: `apps/web/src/pages/DashboardPage.tsx`
- Project list and forms: `apps/web/src/features/projects/ProjectPages.tsx`
- Project API: `apps/api/src/modules/projects`
- Prisma models: `apps/api/prisma/schema.prisma`
- Styles: `apps/web/src/styles.css`
- Environment template: `.env.example`

Keep the API client and the server-side policies. If you add a resource, copy the
project vertical slice and add a policy test.

## Security boundaries

- Access tokens stay in memory. Refresh tokens stay in sealed HttpOnly cookies.
- Mutations use the CSRF bootstrap and the exact browser Origin.
- Route guards are convenience. API middleware and policies are the
  authorization boundary.
- Never add a second users or sessions table, store tokens in browser storage,
  disable CSRF, or put backend secrets in `VITE_*` variables.
- Password changes and logout revoke sessions server-side.
- Parse untrusted input with Zod. Return explicit errors, not stack traces.

Read `THREAT_MODEL.md`, `AGENTS.md`, and `docs/PRODUCTION.md` before deployment.

## Launch checklist

1. Replace the generated development secrets in `.env`.
2. Set `WEB_ORIGIN` to the exact production web origin.
3. Use external PostgreSQL and a real `redis://` or `rediss://` service.
4. Configure email delivery for verification and recovery links.
5. Replace the landing copy, logo, and colors.
6. Run `npm run test`, `npm run typecheck`, `npm run openapi:check`, and
   `npx create-authenik8-app@latest doctor`.
7. Read `docs/PRODUCTION.md` and complete the deployment review.

## Not included

Billing, payments, subscription management, email delivery, and deployment
credentials are intentionally not part of this starter. OAuth provider
credentials are not configured; the generated hooks are ready when you add
them. Add these as separate services. Never put payment, email, or OAuth
secrets in client code.

## Template contract

`template.json` describes the catalog entry. The generated project is the
existing `fullstack` template with the Pro configuration and `PRO_TEMPLATE.md`.
There is no second identity stack and no fork of the full-stack template.
