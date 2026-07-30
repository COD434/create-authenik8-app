# Lovable quickstart

This repeatable path starts with an empty directory and ends with an
Authenik8-backed Lovable frontend.

## 1. Generate and prove the backend

Requirements are Node.js `^20.19 || ^22.12 || >=24`, npm, and Git. Docker is
optional for local development.

```bash
npx create-authenik8-app team-projects --yes --preset fullstack \
  --frontend lovable --oauth google,github --git
cd team-projects
npm run dev
```

The first run starts project-local PostgreSQL, applies the migration, seeds the
administrator, and starts the API on port 3000 and reference web app on port
5173. In a second terminal:

```bash
curl http://localhost:3000/api/health/ready
npm test
npm run typecheck
npm run build
npm run openapi:check
```

Use the generated development administrator only locally and change its
password in shared environments.

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
