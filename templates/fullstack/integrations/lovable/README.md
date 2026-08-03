# Build the frontend with Lovable

Vibe-code the interface. Keep identity on a backend you own.

**Start here:** [`START_HERE.md`](./START_HERE.md)

That short guide is the developer path. This README is reference material for
the integration contracts and validator once the Lovable project exists.

Authenik8 owns registration, login, verification, recovery, OAuth, token
verification, refresh rotation, sessions, revocation, roles, administrator
operations, audit events, database access, and secrets. Lovable owns public
pages, forms, application screens, loading/error states, responsive styling,
and accessible interactions. Do not enable Lovable Cloud auth, Supabase auth,
or any second authentication backend.

The included `apps/web` remains the tested React reference. Keep it until the
Lovable frontend passes the same lifecycle; replacing the reference app is a
deliberate later step.

## Automated path

1. Run `npm run dev:lovable` and verify `http://localhost:3000/api/health/ready`.
2. Connect the Lovable connector in Codex once.
3. Open this repository in Codex and say:
   `Start the Lovable frontend for this project.`

The generated skill at `.agents/skills/authenik8-lovable/SKILL.md` exports the
client, uploads contracts, creates the Lovable project, applies
`LOVABLE_PROMPT.md` one stage at a time, and returns editor/preview links.

Manual steps that may remain:

- Selecting a Lovable workspace when more than one is available.
- Connecting the Lovable project to GitHub.

## Reference workflow

Use this only when you are not using the Codex skill.

1. From the generated repository, run `npm run dev:lovable` and verify
   `http://localhost:3000/api/health/ready`.
2. Run `npm test`, `npm run typecheck`, and `npm run openapi:check`.
3. Create a frontend in Lovable without enabling Cloud authentication or
   connecting Supabase authentication.
4. Connect that Lovable project to its own GitHub repository. Keep the
   Authenik8 backend repository separate for the first integration.
5. Run `npm run export:lovable-client`. Copy both generated archives from
   `integrations/lovable/vendor/` into the frontend repository and install:

   ```bash
   npm install ./vendor/authenik8-contracts.tgz ./vendor/authenik8-api-client.tgz
   ```

   The included React reference consumes the same packages directly through
   the npm workspace. Do not modify the exported client. See
   `packages/api-client/README.md`.
6. Add the two public values from `env.example` to Lovable. Never put a secret
   in a `VITE_*` variable.
7. Give Lovable `openapi.json`, `FRONTEND_CONTRACT.md`, and
   `SECURITY_RULES.md`.
8. Apply `LOVABLE_PROMPT.md` one numbered step at a time. Review and commit
   after each step.
9. Copy `scripts/doctor-lovable.mjs` into the frontend repository or point the
   generated command at it. Run `npm run doctor:lovable -- /path/to/frontend`.
10. Complete `acceptance-checklist.md` on the intended custom domains before
    deployment.

## Supported domain layouts

Recommended production:

```text
Frontend  https://app.example.com
API       https://api.example.com
```

These origins are different origins but the same site. The strict refresh and
CSRF cookies work without weakening their attributes. A same-origin reverse
proxy (`https://example.com` with API paths under `/api`) is also supported.

Lovable preview (`https://project.lovable.app` with
`https://api.example.com`) is cross-site. It is useful for visual work and
public API checks, but it is not an officially supported complete cookie
session layout: browser third-party-cookie policy can block refresh. Test
login, refresh, logout, and OAuth on a same-site custom domain.

Set the backend `WEB_ORIGIN` to one exact frontend origin. Credentialed CORS
never uses `*`. See `docs/lovable/session-and-domain-model.md` in the Authenik8
source documentation.

## GitHub sync

Lovable sync is bidirectional. Commit before each prompt, keep generated client
and security files in CODEOWNERS if your workflow supports it, and inspect
Lovable’s diff before merging. Disconnecting Lovable from GitHub does not
delete or transfer the Authenik8 backend, database, Redis sessions, or secrets.

## Validate

From this generated repository:

```bash
npm run doctor:lovable -- /path/to/lovable-frontend
```

Or with the CLI:

```bash
npx create-authenik8-app@latest doctor frontend --target lovable /path/to/lovable-frontend
```

Use `--json` for CI. A failure exits non-zero. The validator catches common
integration mistakes; it does not certify the application or replace backend
tests and manual browser testing.

Troubleshooting is in `integrations/lovable/TROUBLESHOOTING.md` and the
generated `FRONTEND_CONTRACT.md`.
