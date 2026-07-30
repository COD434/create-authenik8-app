# Lovable acceptance checklist

Run this against the intended custom frontend and API domains. Record browser,
date, commit, and API deployment for the results.

## Authentication

- [ ] Registration succeeds and duplicate/invalid input is useful.
- [ ] Verification and resend work without leaking whether unrelated accounts exist.
- [ ] Login succeeds; invalid credentials fail safely.
- [ ] `auth.currentUser()` returns the public user.
- [ ] An expired access token recovers through exactly one cookie refresh.
- [ ] A failed refresh clears UI auth state without a loop.
- [ ] Logout revokes the active session and clears local in-memory state.
- [ ] Password recovery and reset work with expired/invalid-token errors.
- [ ] Google OAuth succeeds with the exact configured callback.
- [ ] GitHub OAuth succeeds with the exact configured callback.
- [ ] OAuth failure returns to a safe fixed frontend route.

## Account and authorization

- [ ] Active sessions show current, timestamps, IP, and user-agent.
- [ ] One other session can be revoked.
- [ ] All other sessions can be revoked.
- [ ] Revoking the current session prevents refresh.
- [ ] A protected route waits for startup restoration and rejects unauthenticated access.
- [ ] Admin user list/detail, role, status, session revocation, and audit work.
- [ ] An ordinary user calling an admin API receives `403`.
- [ ] Editable UI state cannot grant access to another user’s resource.

## Browser and UX

- [ ] Mobile layouts remain usable at 320 CSS pixels.
- [ ] Keyboard-only navigation, focus order, labels, and dialogs work.
- [ ] Loading, empty, validation, network, `401`, `403`, `404`, and `429` states are visible.
- [ ] Direct navigation to each SPA route works through the deployed rewrite.
- [ ] CORS preflight succeeds only from the configured frontend origin.
- [ ] Login, refresh, OAuth, and logout are tested in Chromium, Firefox, and Safari where practical.
- [ ] Custom-domain behavior is compared with Lovable preview behavior.

## Secret and storage inspection

- [ ] DevTools localStorage, sessionStorage, IndexedDB, URLs, logs, and analytics contain no tokens.
- [ ] The refresh cookie is HttpOnly, Secure in production, SameSite=Strict, and scoped to `/api`.
- [ ] Built JavaScript contains no OAuth secret, database/Redis URL, private JWK field, or refresh secret.
- [ ] Generated dependencies are reviewed and audited.
- [ ] `npm run doctor:lovable -- /path/to/frontend` passes.
- [ ] Backend tests, typecheck, build, and `npm run openapi:check` pass.
