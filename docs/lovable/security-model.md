# Lovable integration security model

## Trust boundary

```text
Untrusted browser / Lovable UI
        │ public input, Bearer access token, credentialed cookie transport
        ▼
Authenik8 API policies and middleware
        │
        ├── PostgreSQL: identities, application data, audit, session records
        ├── Redis: core sessions, rotation locks, OAuth state/exchange
        └── Secret store: signing keys, OAuth secrets, refresh seal, mail key
```

Everything shipped to the browser is public and editable. Hiding a button or
route is not authorization. The API authenticates the active session and
enforces role, ownership, and resource policy for every protected operation.

## Credential model

- Short-lived access tokens are held only in memory.
- Refresh tokens are sealed and held only in an HttpOnly, Secure production,
  SameSite=Strict cookie scoped to `/api`.
- CSRF uses a signed HttpOnly cookie plus the matching header value.
- Origin is checked on cookie-driven mutations.
- Refresh is attempted once through one shared promise; failures clear local
  authentication.
- OAuth redirects contain a single-use exchange code, not an access or refresh
  token.

Never persist credentials to browser storage, logs, analytics, URL parameters,
or state-persistence libraries.

## Secrets

`VITE_*` values are bundled into public JavaScript. Database/Redis URLs, OAuth
client secrets, signing JWKS private fields, `REFRESH_SECRET`, provider mail
keys, and seed credentials stay on the API host.

If a secret reaches the frontend or Git history, remove it and rotate it. A
later deletion from source is not sufficient.

## Generated-code review

Lovable security scanning and Authenik8 Lovable Doctor catch classes of
mistakes; neither is a certification. Review dependencies, unsafe HTML,
network calls, environment use, and every authentication-related diff. Run
backend tests and manually prove ordinary-user `403`, refresh replay rejection,
revocation, logout, and OAuth destination behavior.
