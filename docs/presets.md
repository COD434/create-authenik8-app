# Presets

| Preset | Best for | Included |
| --- | --- | --- |
| **Express API (JWT only)** | APIs that manage identities elsewhere | Protected routes, rotating refresh tokens, RBAC, optional Prisma |
| **Express API + email/password** | First-party accounts | Registration, login, password hashing, Prisma |
| **Express API + OAuth** | Multiple sign-in methods | Password auth, Google and/or GitHub OAuth, account linking |
| **Fullstack application** | Starting a complete product | React/Vite, Express, shared contracts, typed client, PostgreSQL, Redis, account and admin UI, Project CRUD |
| **Fullstack + Lovable frontend** | Vibe-coded UI with owned identity/backend | The complete fullstack reference plus OpenAPI, safe client export, staged Lovable prompts, validator, and deployment contract |

Operational requirements:

- Fullstack uses npm workspaces, project-local PostgreSQL, in-process local Redis compatibility, and Prisma. Docker is optional.
- Lovable is a fullstack frontend choice, not another auth preset. The included
  React app remains the tested reference and Authenik8 stays the backend
  authority.
- JWT-only expects the application to provide a trusted identity source. Prisma is optional.
- Email/password requires Prisma and SQLite or PostgreSQL.
- OAuth adds Google and/or GitHub credentials to the email/password requirements.
- All Express presets use an in-process Redis-compatible store locally and require external Redis in production.

The [quickstart](quickstart.md) covers the commands required after generation.
For the complete application structure, see the [Fullstack App Kit](fullstack-app-kit.md).
For the AI-frontend workflow, see [Lovable integration](lovable.md).

[Back to the documentation index](../README.md#documentation)
