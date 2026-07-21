# Quickstart

Create a new project:

```bash
npx create-authenik8-app my-app
```

Choose the installer for an Express preset when needed:

```bash
npx create-authenik8-app my-api --package-manager pnpm
```

The CLI uses the invoking package manager when it can identify one. Otherwise, it defaults to npm. Install commands use the local package cache first and suppress registry audit and funding requests during scaffolding. Set `AUTHENIK8_VERBOSE=1` to show complete installer output.

Choose the fullstack application for the complete App Kit, or select one of the three Express API presets.

The interactive fullstack path includes password auth and leaves OAuth providers unselected by default. Add Google or GitHub only when you are ready to configure provider credentials.

## Fullstack application

Requirements: Node.js 20.19+, 22.12+, or 24+ and npm. Docker is optional.

```bash
cd my-app
npm run dev
```

`npm run dev` starts project-local PostgreSQL, applies the shipped migration,
seeds the administrator idempotently, and then starts the app. Local auth state
uses an in-process Redis-compatible store. Open
`http://localhost:5173`. Vite proxies `/api` to Express on
`http://localhost:3000`.

The unchanged local seed signs in with `admin@example.com` and
`ChangeMe123!`. The generated `.env` controls both values. Change the password
before sharing the environment.

## Express API

Requirements: Node.js 20.19+, 22.12+, or 24+.

```bash
cd my-app
npm run db:migrate # Skip only when JWT-only was generated without Prisma
npm run dev
```

Express presets use an in-process Redis-compatible store locally. Docker is not required for Redis. If you selected PostgreSQL, start it with `npm run docker:up` or point `DATABASE_URL` to an existing database before migrating.

## Next steps

- Review the available [presets](presets.md).
- Use [non-interactive generation](non-interactive-generation.md) in scripts or CI.
- Run [project diagnostics](project-diagnostics.md) after configuring the generated application.

Generation runs the static Doctor checks before reporting success. When dependency installation is skipped, the missing engine is reported as an expected warning and the rest of the generated auth boundary is still validated. Run the complete Doctor command after installing dependencies and configuring any external services.

[Back to the documentation index](../README.md#documentation)
