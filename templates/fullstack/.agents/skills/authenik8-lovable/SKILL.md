---
name: authenik8-lovable
description: >-
  Builds or validates a Lovable-generated React frontend against the Authenik8
  backend of this project. Use when the user asks to build, extend, or debug
  the Lovable frontend, export the API client, or validate the frontend
  against the Authenik8 security boundary.
---

# Authenik8 Lovable integration skill

## Purpose

Guide a Lovable-generated React frontend so it talks to the Authenik8 backend
of this project through the exported `@authenik8/api-client`. Authenik8 stays
the only identity and authorization authority; this skill keeps the Lovable
side inside the security boundary.

## Prerequisites

1. Confirm the Lovable connector is connected and authenticated.
2. Confirm the backend contract is current: run `npm run openapi:check`
   (and `npm run openapi:generate` if the API changed).
3. Confirm the client export is current: run `npm run export:lovable-client`
   and commit the exported archive(s).
4. Read `integrations/lovable/FRONTEND_CONTRACT.md` and
   `integrations/lovable/SECURITY_RULES.md` before writing frontend code.

## The invariant

Repeat this at the beginning of every step:

> Authenik8 is the only identity and backend authority. Do not enable Lovable
> Cloud auth or Supabase auth. Do not create users/sessions tables or another
> backend. Do not store tokens in localStorage, sessionStorage, IndexedDB,
> client-readable cookies, logs, analytics, or URLs. Do not expose secrets.
> Use `@authenik8/api-client` without rewriting it, including credentialed
> cookie/CSRF/refresh behavior. UI route guards do not replace backend
> authorization. Keep safe server errors and request IDs visible in
> development.

## Workflow

1. **Public UI first**: landing, login, registration, forgot-password,
   reset-password, verify-email, and OAuth callback routes. No auth SDKs, no
   backend calls yet.
2. **Client wiring**: configure `VITE_AUTHENIK8_API_URL` and `VITE_APP_URL`.
   Create exactly one client instance with `createAuthenik8Client`, plus an
   auth provider with `loading` / `authenticated` / `unauthenticated` /
   `error` states. Call `auth.restore()` on startup. Keep only the public
   user projection in UI state.
3. **Auth flows**: sign-up, sign-in, forgot/reset password, email
   verification, OAuth start + one-time exchange, refresh handling. Let the
   client manage CSRF bootstrap, refresh retry, and cross-tab coordination.
4. **Protected app features**: fetch through the client's typed groups
   (user, account, sessions, projects, admin, audit). Handle server errors
   and request IDs visibly.
5. **Validate before release**: run `npm run doctor:lovable` and
   `npm run openapi:check`. Fix every `error` finding; treat `warning`
   findings as release blockers unless the user accepts them explicitly.

## Constraints

- Never add authentication, token, session, or user-table code to Lovable.
- Never rewrite or fork `@authenik8/api-client`.
- Never read refresh tokens; they exist only in the HttpOnly cookie.
- Never receive or use backend secrets in `VITE_*` variables.
- The production session lifecycle must be proven on a same-site custom
   domain (`app.example.com` + `api.example.com`, or a same-origin proxy);
   a `*.lovable.app` preview is for visual work only.

## Troubleshooting

See `integrations/lovable/TROUBLESHOOTING.md`. Common cases:

- **CORS/origin errors**: confirm exact allowed origins and the production
  API domain; never enable wildcard credentialed CORS.
- **CSRF failures**: confirm the client bootstrap ran; never disable CSRF.
- **Refresh loops**: confirm the HttpOnly cookie policy and same-site
  setup; never expose refresh tokens to JavaScript.
- **Preview-only session issues**: move the test to a same-site custom
  domain; do not loosen cookie or Origin policy.

## Acceptance

Finish only when the acceptance checklist in
`integrations/lovable/acceptance-checklist.md` is satisfied for the changed
surface.
