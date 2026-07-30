# Lovable quickstart

This repeatable path starts with an empty directory and ends with an
Authenik8-backed Lovable frontend.

<<<<<<< HEAD
## 1. Generate and start the backend
=======
## 1. Generate and prove the backend
>>>>>>> 184b547 (feat:added lovable3)

Requirements are Node.js `^20.19 || ^22.12 || >=24`, npm, and Git. Docker is
optional for local development.

```bash
npx create-authenik8-app team-projects --yes --preset fullstack \
  --frontend lovable --oauth google,github --git
cd team-projects
<<<<<<< HEAD
npm run dev:lovable
```

The first run starts project-local PostgreSQL, applies the migration, seeds the
administrator, and starts the API on port 3000 without the reference web app on
port 5173. In a second terminal:
=======
npm run dev
```

The first run starts project-local PostgreSQL, applies the migration, seeds the
administrator, and starts the API on port 3000 and reference web app on port
5173. In a second terminal:
>>>>>>> 184b547 (feat:added lovable3)

```bash
curl http://localhost:3000/api/health/ready
npm test
npm run typecheck
npm run build
npm run openapi:check
```

Use the generated development administrator only locally and change its
password in shared environments.

<<<<<<< HEAD
## 2. Use ChatGPT with Authenik8 MCP and Lovable

When the Authenik8 MCP app is available in ChatGPT, make it and Lovable
available to the chat where you will build the frontend. Sign into the Lovable
workspace where the frontend should be created.

Authenik8 MCP provides read-only planning, contract, and integration-validation
guidance. Lovable creates and edits the frontend. Neither tool handles
Authenik8 runtime authentication, backend secrets, or production operations.

## 3. Build the frontend with the generated contract

Give Lovable the generated integration materials from `integrations/lovable/`:

- `openapi.json`
- `FRONTEND_CONTRACT.md`
- `SECURITY_RULES.md`
- `LOVABLE_PROMPT.md`
- the exported `vendor/` client archives after `npm run export:lovable-client`

Use Authenik8 MCP to check the proposed integration before applying it, then
use Lovable to create the UI one staged prompt at a time. Do not enable Lovable
Cloud authentication, Supabase authentication, or another backend.

You may still need to:

- Select a Lovable workspace when more than one is available.
- Connect the resulting Lovable project to GitHub.

Follow `integrations/lovable/START_HERE.md` in the generated project.

## 4. Validate

After the Lovable project is linked to GitHub, point the backend repository’s
validator at the frontend checkout:
=======
## 2. Export the official client

```bash
npm run export:lovable-client
```

Copy these into a `vendor/` directory in the Lovable-synced frontend:

```text
integrations/lovable/vendor/authenik8-contracts.tgz
integrations/lovable/vendor/authenik8-api-client.tgz
```

Install both archives in that frontend:

```bash
npm install ./vendor/authenik8-contracts.tgz ./vendor/authenik8-api-client.tgz
```

Commit the archives with the frontend so Lovable and CI resolve the exact
tested client. Re-export after changing contracts or client code.

## 3. Create the Lovable UI

Create a Lovable project without enabling Lovable Cloud authentication or
Supabase authentication. Connect it to a separate GitHub repository. Lovable’s
GitHub integration is two-way, so commit before each prompt and review every
generated diff.

Add only public frontend values:

```dotenv
VITE_AUTHENIK8_API_URL=http://localhost:3000
VITE_APP_URL=http://localhost:5173
```

Give Lovable these generated files:

```text
integrations/lovable/LOVABLE_PROMPT.md
integrations/lovable/openapi.json
integrations/lovable/FRONTEND_CONTRACT.md
integrations/lovable/SECURITY_RULES.md
```

Run the seven prompt steps separately. Do not send one giant “build
everything” prompt.

## 4. Validate

Point the backend repository’s validator at the frontend checkout:
>>>>>>> 184b547 (feat:added lovable3)

```bash
npm run doctor:lovable -- ../team-projects-frontend
```

Then complete `integrations/lovable/acceptance-checklist.md`. A passing static
validator is necessary but does not replace backend tests or browser testing.

## 5. Move to same-site domains

Before testing refresh, logout, or OAuth in production, deploy:

```text
Frontend  https://app.example.com
API       https://api.example.com
```

Follow the [deployment guide](deployment.md), then repeat the entire acceptance
checklist on the custom domains.
