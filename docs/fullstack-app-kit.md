# Fullstack App Kit

The fullstack preset is an npm workspace with connected frontend, backend, and shared packages:

```text
apps/
  api/                 Express, Authenik8, Prisma, PostgreSQL, Redis
  web/                 React, Vite, React Router, TanStack Query
packages/
  contracts/           Shared Zod request schemas and response types
  api-client/          Typed browser client and refresh handling
  ui/                  Reusable application primitives
```

It includes:

- Registration, login, logout, OAuth, password recovery, and email verification
- Profile, password, linked-provider, session, and session-revocation screens
- Admin users, roles, status controls, session revocation, and audit events
- An owned Project resource across database, API, policy, client, and UI layers
- OpenAPI 3.1 output, health checks, structured logs, request IDs, and security middleware
- Project-local PostgreSQL and Redis-compatible local auth state, Prisma migrations, seed data, tests, and production docs
- Optional Docker Compose for teams that prefer containerized PostgreSQL and Redis

Access tokens remain in browser memory. Refresh tokens use a restricted HttpOnly cookie, and server-side policies remain the authorization boundary.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start project-local PostgreSQL, prepare data, then watch the API, web app, contracts, client, and UI |
| `npm run setup` | Start project-local PostgreSQL for the command, apply migrations, and create seed data without starting watchers |
| `npm run build` | Build all production bundles |
| `npm start` | Start Express and serve the built SPA and `/api` |
| `npm run db:migrate` | Apply the Prisma development migration |
| `npm run db:seed` | Create the configured administrator and example data |
| `npm test` | Run API policy and security tests and web storage tests |
| `npm run typecheck` | Type-check every workspace |

[Back to the documentation index](../README.md#documentation)
