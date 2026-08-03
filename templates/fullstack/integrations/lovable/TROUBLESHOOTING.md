# Lovable troubleshooting

- **Lovable added Supabase or Cloud auth:** revert that change, remove its auth
  SDK/tables, and restart at prompt step 2. Never synchronize two identity
  systems.
- **Login works but refresh fails:** login can return an access token even when
  strict cookies are blocked. Verify `credentials: "include"`, HTTPS, exact
  `WEB_ORIGIN`, cookie delivery, and same-site custom domains.
- **CORS preflight fails:** compare browser Origin byte-for-byte with
  `WEB_ORIGIN`; never add `*`. Check that a proxy is not intercepting OPTIONS.
- **OAuth returns to the wrong host or reports mismatch:** `WEB_ORIGIN` is the
  frontend; provider redirect URIs are the exact API callback URLs.
- **Logout leaves a stale screen:** clear UI auth in `finally`, then prove the
  server result by attempting refresh. Check matching cookie-clear attributes.
- **An ordinary user sees admin UI:** hiding UI is not authorization. The
  protected admin API must return `403`; any data response is a backend issue.
- **Repeated `401`:** create one client instance and remove extra interceptors,
  refresh wrappers, and retry loops.
- **Lovable rewrote the client:** revert it and rerun
  `npm run export:lovable-client`.
- **Preview differs from custom domain:** cross-site preview cookies are not
  the supported lifecycle. Test authentication on `app.example.com` and
  `api.example.com`.
- **Environment value is undefined:** use a `VITE_` public variable and rebuild.
  Never put a secret in it.
- **Direct navigation is `404`:** configure an SPA fallback to `index.html`
  without rewriting `/api` or JWKS requests.
- **GitHub sync changed protected files:** revert the commit, use smaller prompt
  steps, and inspect each two-way sync diff.
