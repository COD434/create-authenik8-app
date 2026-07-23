# Authenik8 Full-stack Starter

A connected React and Express application with secure Authenik8 sessions, account settings, administration, and an owned Project resource.

Optional agent/service identities are disabled by default. Configure
`AUTHENIK8_AGENTS` and follow `AGENT_IDENTITY.md` to add scoped M2M or delegated
agent access without exposing an unsafe public token-minting route.

## Local development

<<<<<<< HEAD
Requirements: Node.js 20.19+, 22.12+, or 24+ and npm. Docker is optional.

```bash
npm run dev
```

That one command starts project-local PostgreSQL, applies the shipped migration,
creates the seed administrator, and starts every development watcher.
Redis-compatible auth state runs inside the API process during local
development. Setup is idempotent, so subsequent runs reuse the same database. Open
`http://localhost:5173`. The API runs on `http://localhost:3000/api`.

Run setup without starting the watchers when needed:

```bash
npm run setup
```

The embedded PostgreSQL server listens only on loopback while a local command is
running and stores data under `.authenik8/`. No global PostgreSQL, Redis, or
Docker installation is required. If you provide your own PostgreSQL, set
`AUTHENIK8_LOCAL_DATABASE=external` and update `DATABASE_URL`.

Docker Compose remains available as an explicit option:

```bash
npm run docker:up
```

When using the containers, set `AUTHENIK8_LOCAL_DATABASE=external` and
`REDIS_URL=redis://localhost:56379`. Production must always use external
PostgreSQL and a real `redis://` or `rediss://` service. The API rejects the
in-process Redis setting in production.

The generated `.env` contains development values; replace every secret before deploying.

Validate the workspace auth configuration and selected Redis mode at any time:

```bash
npx create-authenik8-app@latest doctor
```

`authenik8.json` records the generated architecture and Authenik8 engine version. It contains no secrets and should be committed with the workspace.

After committing `package-lock.json`, run `npx create-authenik8-app@latest add ci-github` to add the pinned Doctor and upgrade-policy workflow. Preview it first with `--dry-run`.

With an unchanged generated `.env`, sign in with `admin@example.com` and
`ChangeMe123!`. These values come from `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`. Change the password immediately, including for local
environments shared by multiple people.
=======
Requirements: Node.js 20.19+, 22.12+, or 24+, npm, and Docker with Compose.

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000/api`. The generated `.env` contains development values; replace every secret before deploying.

The seeded administrator uses `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Change the default password immediately, including for local environments shared by multiple people.
>>>>>>> main

## Application map

- Authentication: registration, login, OAuth, refresh, logout, password recovery, and email verification.
- Account: profile, password, linked providers, active sessions, and revocation.
- Administration: users, roles, status, session revocation, and audit events.
- Projects: list, create, details, edit, archive, and delete with owner policies.

The API follows a contract, repository, service, controller, policy, and route convention. Copy `apps/api/src/modules/projects` and `apps/web/src/features/projects` when adding a vertical feature.

## Session model

The API returns a short-lived access token to the Auth provider, which holds it only in memory. The browser sends an encrypted, restricted HttpOnly refresh cookie automatically. The API client obtains a signed CSRF token for browser mutations, performs one refresh after a `401`, shares in-flight token requests, and retries once. It never reads from or writes tokens to browser storage.

Route guards are user experience controls. API middleware and policies remain the authorization boundary.

## OAuth callbacks

Configure either provider with these exact local callback URLs:

```text
http://localhost:3000/api/auth/oauth/google/callback
http://localhost:3000/api/auth/oauth/github/callback
```

OAuth callbacks place a single-use exchange code and an encrypted session payload in Redis, then redirect to the SPA. Tokens are not placed in a URL.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

Read [docs/PRODUCTION.md](docs/PRODUCTION.md) and [THREAT_MODEL.md](THREAT_MODEL.md) before deployment. Production requires HTTPS, strong unique secrets, non-public Redis, database backups, a trusted reverse proxy configuration, an exact `WEB_ORIGIN`, and a working mail delivery integration for recovery and verification links.

## Health and tests

- `GET /api/health/live` confirms the process is running.
- `GET /api/health/ready` checks PostgreSQL and Redis.
- `GET /api/docs/openapi.json` returns the generated OpenAPI 3.1 contract.
- `npm test` covers ownership/admin policies, encrypted cookies, origin and CSRF defenses, and the browser storage rule.
<<<<<<< HEAD
- `npm run typecheck` builds internal packages, generates Prisma Client, and checks each workspace from a clean checkout.
=======
- `npm run typecheck` checks each workspace.
>>>>>>> main
