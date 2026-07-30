# Non-negotiable security rules

These rules apply to every Lovable change.

1. Frontend code is public and untrusted. The Authenik8 API is the identity and
   authorization boundary.
2. Do not enable Lovable Cloud authentication or Supabase authentication. Do
   not create another users table, sessions table, or auth backend.
3. Never put a secret in a `VITE_*` variable. OAuth client secrets, database
   credentials, Redis credentials, signing keys, private JWK fields, and
   `REFRESH_SECRET` belong only on the backend.
4. Keep access tokens in memory. Never write an auth token to `localStorage`,
   `sessionStorage`, IndexedDB, a client-readable cookie, application state
   persistence, logs, analytics, or URL parameters.
5. Refresh tokens remain in the Authenik8 `HttpOnly` cookie. Frontend
   JavaScript must never receive or read a refresh token.
6. Use the generated `@authenik8/api-client`; do not rewrite its refresh,
   cookie, CSRF, logout, or token-storage behavior.
7. Send credentialed requests where the contract requires them. Fetch the CSRF
   token and echo it in `X-CSRF-Token` on mutations.
8. UI guards control navigation only. Protected data, ownership, roles,
   permissions, active sessions, and administrator access are verified by the
   backend on every request.
9. Admin visibility never grants admin access. Never trust a role from a form,
   query string, browser storage, or other editable client state.
10. Configure one exact HTTPS frontend origin in the backend. Never combine
    credentials with `Access-Control-Allow-Origin: *`.
11. OAuth callback URLs must match the provider and backend configuration
    exactly. Never accept an arbitrary return destination or put access or
    refresh tokens in a redirect URL.
12. Escape text and sanitize any deliberately supported user-authored HTML.
    Do not render API or user strings with unsafe HTML APIs.
13. Keep useful server errors and request IDs visible during development.
    Never expose stack traces, environment values, or internal error details
    to production users.
14. Review and audit dependencies introduced by generated code. Remove
    unused auth, database, and backend SDKs.
15. Lovable security scanning complements this repository's tests and
    Authenik8 validation. It is not a replacement for them and is not proof of
    certification.

If a requested UI change conflicts with a rule above, preserve the rule and
report the conflict instead of weakening the backend or session model.
