# Migration readiness (Supabase, Clerk, Auth0)

`create-authenik8-app migrate <provider>` is a **read-only planning command**
for teams moving an existing project to Authenik8. It scans the target
directory for evidence of a third-party auth provider and maps every detected
call site to the concrete Authenik8 surface that replaces it — REST endpoints,
the typed `@authenik8/api-client` groups, admin surfaces, and (for row-level
security-style data access) the `add resource` scaffolder.

It writes nothing, never reads `.env` values, and never prints file contents:
evidence is reported as stable `file:line` locations with stable pattern IDs.

```bash
npx create-authenik8-app migrate supabase ./my-supa-app
npx create-authenik8-app migrate clerk .
npx create-authenik8-app migrate auth0 ./legacy-app --json
```

`--json` prints a schema-stable report object (provider, directory, scan
counts, findings with `file`/`line`/`id`/`tier`, per-primitive mappings,
not-covered list, next steps, and session boundaries) for tooling.

Providers: `supabase`, `clerk`, `auth0`.

## How findings are classified

- **strong** — package imports and provider-typed environment variables
  referenced in code. Presence means the provider is almost certainly in use.
- **soft** — call-site shapes (client constructors, `.auth.*` flows, table
  queries, React components/hooks, server helpers). These can have false
  positives across libraries, so the report labels the overall result
  `likely` rather than `detected` when no strong evidence exists.

Scanned formats: TypeScript, JavaScript, Svelte/Vue/Astro sources, and SQL
migration files. Skipped without inspection: `.env*`, lockfiles, minified
bundles, `node_modules`, build outputs (`dist`/`build`/`out`/`.next`), and
other non-code artifacts. Files larger than 1 MB are skipped and counted; the
walk stops after 2,000 code files.

## What the report contains

- `readiness`: `detected` (strong evidence), `likely` (soft evidence only), or
  `not-detected`.
- A mapping table per provider primitive, for example
  `supabase.auth.signInWithPassword → POST /api/auth/login`,
  `getToken() → POST /api/auth/refresh`,
  `useAuth0().loginWithRedirect → GET /api/auth/oauth/:provider`, and
  RLS-guarded table queries → your own Prisma-backed module (scaffold a start
  with `npx create-authenik8-app add resource <Name> --fields "<spec>"`).
- An explicit **not covered today** list (for example Supabase Storage and
  Realtime, Clerk's hosted UI components, Auth0 Actions/Rules runtime) so no
  unverified equivalence is implied.
- Session and secret boundary reminders that apply during and after the move:
  tokens in memory only, sealed HttpOnly refresh cookies, no backend secrets in
  `VITE_*`, and API-side authorization instead of UI route guards.

## Deliberately out of scope

This is slice one of the migration workstream: analysis and mapping only.
It does **not** yet import schemas or users from the provider's database, and
it does not rewrite call sites (no codemods). Any future import step will
remain a separate, explicit, confirmable command.
