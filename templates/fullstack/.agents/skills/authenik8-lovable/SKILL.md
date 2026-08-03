---
name: authenik8-lovable
description: >-
  Start and orchestrate the Lovable frontend for an Authenik8 fullstack project
  generated with features.frontend "lovable". Use when the developer says
  "Start the Lovable frontend for this project", "Start Lovable", or asks to
  create/wire the Lovable UI from this repository.
---

# Start the Lovable frontend for Authenik8

You are orchestrating Lovable against an Authenik8 backend the developer already
owns. Authenik8 remains the only identity and authorization authority. Do not
enable Lovable Cloud auth, Supabase auth, or a second backend.

The developer should not need to understand OpenAPI, package archives, security
contracts, staged prompts, upload URLs, or connector calls. Do that work
yourself. Tell them only about actions that cannot be automated.

## When to use

Activate when `authenik8.json` has `features.frontend: "lovable"` and the
developer asks to start, create, or wire the Lovable frontend.

If `features.frontend` is missing or not `"lovable"`, stop and explain that this
project was not generated with `--frontend lovable`.

## Prerequisites

1. Confirm the Lovable MCP connector is available and authenticated.
2. If it is not connected, tell the developer to enable the Lovable connector in
   Codex and sign into the correct workspace, then stop.
3. Prefer that `npm run dev:lovable` is already running so the API is reachable
   at `http://localhost:3000`. If it is not, start it or ask the developer to
   run it before applying auth-connected prompt stages.

## Automated workflow

Run these steps in order. Do not ask the developer to perform any step you can
complete with local commands or Lovable tools.

### 1. Detect the project

- Read `authenik8.json` and confirm `features.frontend === "lovable"`.
- Read `integrations/lovable/START_HERE.md` only if you need the short handoff.
- Treat these files as agent inputs, not developer homework:
  - `integrations/lovable/LOVABLE_PROMPT.md`
  - `integrations/lovable/openapi.json`
  - `integrations/lovable/FRONTEND_CONTRACT.md`
  - `integrations/lovable/SECURITY_RULES.md`
  - `integrations/lovable/env.example`
  - `integrations/lovable/acceptance-checklist.md`

### 2. Run backend checks

From the project root:

```bash
curl -sf http://localhost:3000/api/health/ready
npm run openapi:check
npm run export:lovable-client
```

If health is down, start or ask for `npm run dev:lovable`, then retry health.
Keep going once the API is ready and the client archives exist under
`integrations/lovable/vendor/`.

### 3. Prepare Lovable attachments

Upload these files with `get_file_upload_url`, then PUT each file to the
returned URL. Keep the resulting `file_id` values:

| File | Purpose |
| --- | --- |
| `integrations/lovable/openapi.json` | Machine-readable API contract |
| `integrations/lovable/FRONTEND_CONTRACT.md` | Browser/client contract |
| `integrations/lovable/SECURITY_RULES.md` | Hard security invariants |
| `integrations/lovable/LOVABLE_PROMPT.md` | Staged build sequence |
| `integrations/lovable/env.example` | Public Vite env names only |
| `integrations/lovable/vendor/authenik8-contracts.tgz` | Exact contracts package |
| `integrations/lovable/vendor/authenik8-api-client.tgz` | Exact browser client |

Never upload `.env`, signing keys, private JWKs, database URLs, or other
secrets.

### 4. Choose a workspace

1. Call `list_workspaces`.
2. If exactly one eligible workspace exists, use it.
3. If multiple workspaces are available, ask the developer which one to use.
   That selection is an allowed manual step.
4. Do not invent a workspace ID.

### 5. Create the Lovable project

Call `create_project` with:

- `workspace_id` when known
- `files`: the uploaded contract/client `file_id`s
- `initial_message` based on **Step 1** from `LOVABLE_PROMPT.md`, plus:
  - Authenik8 is the only identity/backend authority
  - Do not enable Lovable Cloud auth or Supabase auth
  - Install the attached `@authenik8/contracts` and `@authenik8/api-client`
    archives into `vendor/` and depend on them
  - Public env only: `VITE_AUTHENIK8_API_URL` and `VITE_APP_URL` from
    `env.example` (local defaults: `http://localhost:3000` and the Lovable
    preview origin once known)
  - Stop after the public UI from Step 1

After creation, call `get_project` and keep the editor URL, preview URL, and
`project_id`.

### 6. Apply staged prompts sequentially

Read `LOVABLE_PROMPT.md`. For each remaining numbered step (2 through 7):

1. `send_message` with that step’s instructions and the invariant block from
   the prompt file. Attach the contract files again when the step needs them.
2. Wait for completion (`wait=true`, or poll `get_message` after timeout).
3. Inspect with `get_diff` and, when useful, `list_files` / `read_file`.
4. Confirm the step’s stop condition before continuing.
5. Do not combine multiple numbered steps into one message.
6. Do not weaken cookie, CORS, Origin, CSRF, OAuth-state, token-storage, or
   backend authorization rules to make a preview pass.

If a step fails, fix only the confirmed failure, then continue. Do not restart
from scratch unless the project is unusable.

### 7. Finish and report

When the staged prompts are done:

1. Call `get_project` again for the latest editor and preview URLs.
2. Remind the developer that connecting the Lovable project to GitHub is still
   manual because the connector does not expose GitHub-link setup.
3. Optionally mention `npm run doctor:lovable -- /path/to/frontend` once a
   GitHub-synced checkout exists.
4. Do not dump OpenAPI, upload URLs, archive paths, or connector internals
   unless the developer asks for debugging detail.

## Response shape

Return a short status with:

- Lovable editor URL
- Lovable preview URL
- Workspace used
- Prompt stages completed
- Manual follow-ups only: workspace choice (if needed) and GitHub linking

## Hard rules

- Never enable Lovable Cloud authentication or Supabase authentication.
- Never create users/sessions tables or another auth backend in Lovable.
- Never put secrets in `VITE_*` variables or uploaded files.
- Never rewrite `@authenik8/api-client`; install the exported archives as-is.
- Never store tokens in localStorage, sessionStorage, IndexedDB,
  client-readable cookies, logs, analytics, or URLs.
- UI route guards are UX only; Authenik8 middleware and policies authorize.
- `*.lovable.app` previews are useful for visual work; complete cookie-session
  auth still needs same-site custom domains later.
