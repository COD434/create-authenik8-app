# Start with Lovable

Authenik8 owns identity and the API. Lovable builds the browser UI.

## 1. Start the Authenik8 backend

```bash
npm run dev:lovable
```

This starts PostgreSQL, migrations, seeding, package watchers, and the API.
It does not start the reference frontend on port 5173.

## 2. Use ChatGPT with Authenik8 MCP and Lovable

When the Authenik8 MCP app is available in ChatGPT, make it and Lovable
available to the chat where you will build the frontend. Sign into the Lovable
workspace where the frontend should be created.

Authenik8 MCP plans and validates the integration without writing repositories,
handling secrets, or carrying authentication traffic. Lovable creates and edits
the frontend. Authenik8 remains the identity and backend authority.

## 3. Give Lovable the generated contract

Use the following files from this directory with Lovable:

- `openapi.json`
- `FRONTEND_CONTRACT.md`
- `SECURITY_RULES.md`
- `LOVABLE_PROMPT.md`
- `vendor/authenik8-contracts.tgz` and `vendor/authenik8-api-client.tgz` after
  running `npm run export:lovable-client`

Use Authenik8 MCP to plan or validate the proposed integration. Apply
`LOVABLE_PROMPT.md` one numbered step at a time in Lovable, keeping the
security rules unchanged.

## What may still need you

- Selecting a Lovable workspace when more than one is available.
- Connecting the resulting Lovable project to GitHub.

Detailed contracts in this directory are the source of truth for the frontend
integration. Complete `acceptance-checklist.md` before deployment.
