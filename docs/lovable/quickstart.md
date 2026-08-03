# Lovable quickstart

This repeatable path starts with an empty directory and ends with an
Authenik8-backed Lovable frontend.

## 1. Generate and start the backend

Requirements are Node.js `^20.19 || ^22.12 || >=24`, npm, and Git. Docker is
optional for local development.

```bash
npx create-authenik8-app team-projects --yes --preset fullstack \
  --frontend lovable --oauth google,github --git
cd team-projects
npm run dev:lovable
```

The first run starts project-local PostgreSQL, applies the migration, seeds the
administrator, and starts the API on port 3000 without the reference web app on
port 5173. In a second terminal:

```bash
curl http://localhost:3000/api/health/ready
npm test
npm run typecheck
npm run build
npm run openapi:check
```

Use the generated development administrator only locally and change its
password in shared environments.

## 2. Connect Lovable to Codex once

In Codex, enable the Lovable connector and sign into the Lovable workspace
where the frontend should be created.

## 3. Tell Codex one thing

Open the generated project in Codex and say:

> Start the Lovable frontend for this project.

The generated skill at `.agents/skills/authenik8-lovable/SKILL.md` exports the
Authenik8 browser client, uploads the contracts, creates the Lovable project,
applies `LOVABLE_PROMPT.md` one stage at a time, inspects each stage, and
returns the editor and preview links.

You may still need to:

- Select a Lovable workspace when more than one is available.
- Connect the resulting Lovable project to GitHub.

Follow `integrations/lovable/START_HERE.md` in the generated project.

## 4. Validate

After the Lovable project is linked to GitHub, point the backend repository’s
validator at the frontend checkout:

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
