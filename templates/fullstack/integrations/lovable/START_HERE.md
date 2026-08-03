# Start with Lovable

Authenik8 owns identity and the API. Lovable builds the browser UI.

## 1. Start the Authenik8 backend

```bash
npm run dev:lovable
```

This starts PostgreSQL, migrations, seeding, package watchers, and the API.
It does not start the reference frontend on port 5173.

## 2. Connect Lovable to Codex once

In Codex, enable the Lovable connector and sign into the Lovable workspace
where the frontend should be created.

This is the only unavoidable account-related step.

## 3. Tell Codex one thing

Open this project in Codex and say:

> Start the Lovable frontend for this project.

Codex uses `.agents/skills/authenik8-lovable/SKILL.md` to create the Lovable
project, apply the staged prompts, and return the editor and preview links.

## What may still need you

- Selecting a Lovable workspace when more than one is available.
- Connecting the resulting Lovable project to GitHub (the connector does not
  expose GitHub-link setup).

Everything else is handled by the skill. Detailed contracts in this directory
are reference material for the agent, not a manual checklist for you.
