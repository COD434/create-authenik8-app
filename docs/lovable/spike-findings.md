# Lovable reference spike findings

The first reference integration keeps the generated React app as the
executable baseline and a separate private Lovable frontend as the intended UI
workflow.

The public-layout spike is recorded at
[Lovable project 7e827f80-d6a9-4888-a41a-7bd7797a89d6](https://lovable.dev/projects/7e827f80-d6a9-4888-a41a-7bd7797a89d6),
commit `6ea99b8c7c0e5381d3de7e3078ea33ee80955b4b`. It is intentionally
unpublished and has no backend/auth connection. It created landing,
registration, login, recovery, verification, and OAuth-callback UI routes
without Supabase, Lovable auth, token storage, users/sessions tables, or
authentication network calls.

## Assumptions the integration must prevent

The prompt and validator explicitly guard the highest-risk AI-builder
assumptions:

- adding Supabase or Lovable Cloud auth when login screens are requested;
- creating users, sessions, refresh, or role tables in the frontend project;
- persisting tokens to localStorage for convenience;
- calling login, refresh, sessions, or admin routes through a second fetch
  wrapper;
- treating hidden admin navigation as authorization;
- putting OAuth/database secrets in `VITE_*`;
- weakening SameSite, Origin, CSRF, or CORS to make cross-site preview work;
- inventing endpoint names instead of reading OpenAPI.

The spike also introduced a disabled “keep me signed in” checkbox. Even without
storage code, that wording can imply frontend-controlled session persistence.
The staged integration prompt therefore leaves session duration and refresh
behavior with Authenik8 and requires review of every auth-adjacent control.

## Required generator changes

P0 changes implemented:

1. complete and deterministic OpenAPI 3.1;
2. portable client factory with external base URL and in-memory lifecycle;
3. missing profile, provider-unlink, revoke-others, and admin-user-detail API;
4. staged Lovable prompt and complete support pack;
5. explicit same-site custom-domain requirement;
6. reference UI coverage for unlink/revoke-others.

P1 changes implemented:

1. `--frontend lovable` plus metadata/resume state;
2. static and safe runtime Lovable Doctor modes;
3. deterministic client export for a separate frontend repository;
4. deployment, OAuth, troubleshooting, security, and validator docs.

Deferred by the roadmap: a backend-only template, `--frontend custom`, a
Lovable plugin, generic MCP integration, hosted Console automation, and other
AI builders.

## Files Lovable may change

The initial Lovable step changed package metadata, route-tree/router files,
shared public/auth shell components, form UI, site header/footer, route pages,
and styles. Expected later changes are an AuthProvider adapter and public env
example. Changes to the exported client archives, a new auth/backend SDK,
database schema, server secrets, or backend authorization are review blockers.

## Release limitation

Code-level, generated-reference, API integration, and validator tests are
automated. A publicly hosted cross-browser demo, product video, user testing,
and real Google/GitHub provider credentials require external accounts and
remain release operations rather than repository code.
