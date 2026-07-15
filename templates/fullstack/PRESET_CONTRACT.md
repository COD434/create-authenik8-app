# Full-stack preset contract

This document is the testable contract for the `fullstack` preset.

## Stack and boundaries

- Node.js 20.19+, 22.12+, or 24+ and npm workspaces.
- `apps/web`: React, Vite, React Router, TanStack Query, and the generated UI.
- `apps/api`: Express, Authenik8, Prisma, PostgreSQL, Redis, policies, and HTTP controllers.
- `packages/contracts`: shared Zod request schemas and public response types.
- `packages/api-client`: the only browser HTTP client. It owns the in-memory access token and one-time refresh retry.
- `packages/ui`: removable application primitives used by the web workspace.

## Commands

| Command | Guarantee |
| --- | --- |
| `npm run dev` | Builds shared packages and starts API and web together. |
| `npm run build` | Produces the API and frontend production bundles. |
| `npm start` | Starts Express, which serves `/api` and the built SPA. |
| `npm run db:migrate` | Applies the Prisma PostgreSQL development migration. |
| `npm run db:seed` | Creates the configured administrator and example data. |
| `npm test` | Runs API policy/security tests and web storage tests. |

## Network contract

- Vite: `http://localhost:5173`, proxying `/api` to Express.
- Express: `http://localhost:3000`.
- PostgreSQL: `localhost:5432` in local Docker Compose.
- Redis: `localhost:6379` in local Docker Compose.
- Production uses one origin. Express serves `apps/web/dist` after `npm run build`.

## Environment contract

Required: `DATABASE_URL`, `REDIS_URL`, `AUTHENIK8_SIGNING_JWKS`, `AUTHENIK8_ACTIVE_KID`, `AUTHENIK8_ISSUER`, `AUTHENIK8_AUDIENCE`, `REFRESH_SECRET`, and `WEB_ORIGIN`.
OAuth variables are required only for an enabled provider. `RESEND_API_KEY` and `EMAIL_FROM` enable production verification and recovery delivery. See `.env.example` for the complete list.

## Security guarantees

- Access tokens exist only in module memory and are sent as Bearer tokens.
- Refresh tokens are AES-256-GCM sealed in an HttpOnly cookie scoped to `/api`, with `SameSite=Strict` and `Secure` in production.
- Refresh rotation, replay rejection, and server-side refresh revocation use Authenik8 and Redis.
- Browser mutations enforce an exact allowed `Origin` and a signed double-submit CSRF token.
- Admin and Project APIs enforce roles or ownership on the server.
- Credential and recovery failures do not disclose whether an email address exists.
- Request IDs, security headers, redacted structured logs, Redis-backed Authenik8 rate limiting, readiness, and liveness endpoints are enabled.
