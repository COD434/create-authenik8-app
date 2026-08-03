# Lovable onboarding run log

Date: 2026-07-30  
Repo: `create-authenik8-app` (branch `original-feature`)  
Generated app: `lovable-run/`

## Goal

Verify the intended three-step Lovable DX:

1. Generate + `npm run dev:lovable`
2. Connect Lovable to Codex once
3. Tell Codex: `Start the Lovable frontend for this project.`

## What we ran

### A. Generate project from local CLI

```bash
npm run build
node dist/src/bin/cli.js lovable-run \
  --yes --preset fullstack --frontend lovable --no-oauth --git --non-interactive
```

**Result: pass**

- Completion output matched the new handoff:
  - `Authenik8 with Lovable is ready.`
  - `npm run dev:lovable`
  - Codex prompt text
- Generated assets present:
  - `integrations/lovable/START_HERE.md`
  - `.agents/skills/authenik8-lovable/SKILL.md`
  - `package.json` scripts `dev:lovable` / `dev:lovable:watch`
  - `authenik8.json` → `features.frontend: "lovable"`

### B. Start backend-only command

```bash
cd lovable-run
npm run dev:lovable
```

**Result: pass (after restart)**

Observed:

- Embedded PostgreSQL started
- Migration applied
- Seed administrator created
- Watchers started for `contracts`, `client`, `ui`, `api` only
- No Vite/web watcher
- Health check:

```bash
curl -sS http://127.0.0.1:3000/api/health/ready
# {"status":"ready","database":"ok","redis":"ok"}
```

- Port `5173` was down (expected)

Notes:

- First health check was misleading because another process briefly occupied
  port 3000 and returned the docs-site HTML. After a clean restart, the API
  response was correct JSON.
- Running `npm run export:lovable-client` while `dev:lovable` was watching
  rebuilt packages and caused `tsx watch` to restart the API. Prefer exporting
  before long-lived auth-connected stages, or expect a short API blip.

### C. Backend skill prerequisites

```bash
npm run openapi:check
npm run export:lovable-client
```

**Result: pass**

- OpenAPI current and valid 3.1
- Archives written:
  - `integrations/lovable/vendor/authenik8-contracts.tgz`
  - `integrations/lovable/vendor/authenik8-api-client.tgz`

### D. Connect Lovable MCP to Codex

```bash
codex mcp add lovable --url "https://mcp.lovable.dev/?src=skill"
```

**Result: blocked without OAuth client id**

Without `--oauth-client-id`, Codex dynamic registration failed:

```text
Dynamic client registration is restricted to approved partners.
... use the client_id_metadata_document discovery flow instead.
```

Retry with the published Lovable client id:

```bash
codex mcp add lovable \
  --url "https://mcp.lovable.dev/?src=skill" \
  --oauth-client-id "6d465f583e1e4ce5801b1616f735670c"
codex mcp login lovable
```

**Result: pending / blocked on human OAuth**

- Browser authorize URL opened successfully
- First attempt timed out waiting for the OAuth callback
- Second/third attempts still waiting for the developer to approve Lovable
  access in the browser

Until `codex mcp list` shows Lovable as logged in, Codex cannot call
`list_workspaces`, `create_project`, `get_file_upload_url`, or `send_message`.

### E. Codex “Start the Lovable frontend…” orchestration

**Result: not executed yet**

Blocked on step D authentication. Cursor itself has no Lovable MCP servers
configured in this environment (`GetMcpTools` catalog was empty), so the live
create/upload/prompt path must go through Codex after OAuth succeeds.

## Current confidence after this run

| Piece | Status |
| --- | --- |
| Generator completion output | Verified |
| `START_HERE.md` + skill shipped | Verified |
| `npm run dev:lovable` backend-only | Verified |
| Health + OpenAPI + client export | Verified |
| Codex Lovable MCP add with client id | Verified path exists |
| Codex Lovable OAuth login | Needs human approve |
| Full skill orchestration in Lovable | Not yet run |

## Next action required from developer

Approve the open Lovable OAuth browser prompt for Codex, then continue with:

```bash
cd lovable-run
codex exec "Start the Lovable frontend for this project."
```

Record the editor/preview URLs and any manual prompts (workspace selection,
GitHub linking) below.

## Follow-up results

### OAuth `invalid_request` diagnosis

Browser showed:

```text
Authorization failed: Invalid Request
Error code: invalid_request
```

Cause found in the authorize URL Codex generated:

1. First attempts used `https://mcp.lovable.dev/?src=skill`, which produced a
   non-canonical `resource` value.
2. Adding `--oauth-resource` on top of Codex's auto-discovered resource made
   the authorize URL include `resource` **twice**. Lovable rejects that as
   `invalid_request` ("includes a parameter more than once").

Also installed the curated Codex plugin:

```bash
codex plugin add lovable@openai-curated
```

Retry now using the clean MCP URL and a single resource:

```bash
codex mcp add lovable \
  --url "https://mcp.lovable.dev" \
  --oauth-client-id "6d465f583e1e4ce5801b1616f735670c"
```

Authorize URL now contains one `resource=https://mcp.lovable.dev/` parameter.
Awaiting browser approval again.

**Result:** timed out again (`deadline has elapsed`). Lovable MCP remains
configured but **Not logged in**. Backend API on `:3000` stayed healthy.

If the fixed URL still shows `invalid_request`, the remaining likely issue is
that Lovable's public `client_id` does not accept Codex's localhost
`redirect_uri`. In that case use Codex's curated plugin path
(`lovable@openai-curated`, already installed) or connect Lovable from the
Codex app UI rather than `codex mcp login`.
