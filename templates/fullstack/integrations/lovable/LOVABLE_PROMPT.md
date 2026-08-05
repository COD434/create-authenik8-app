# Lovable prompt sequence

Replace these public placeholders before using the prompts:

```text
PRODUCT_NAME=<your product name>
PRODUCT_DESCRIPTION=<one-sentence product description>
AUTHENIK8_API_URL=<https://api.example.com>
FRONTEND_URL=<https://app.example.com>
OPENAPI_FILE=integrations/lovable/openapi.json
CLIENT_PACKAGE=@authenik8/api-client
CLIENT_SOURCE=packages/api-client/src/index.ts
```

Give Lovable `openapi.json`, `FRONTEND_CONTRACT.md`, and `SECURITY_RULES.md`
first. Connect the Lovable project to GitHub. Work through one step at a time,
review its diff, test it, and commit before continuing.

Repeat this invariant at the beginning of every step:

> Authenik8 is the only identity and backend authority. Do not enable Lovable
> Cloud auth or Supabase auth. Do not create users/sessions tables or another
> backend. Do not store tokens in localStorage, sessionStorage, IndexedDB,
> client-readable cookies, logs, analytics, or URLs. Do not expose secrets.
> Use `@authenik8/api-client` without rewriting it, including credentialed
> cookie/CSRF/refresh behavior. UI route guards do not replace backend
> authorization. Keep safe server errors and request IDs visible in
> development.

## Step 1 — public UI only

Build the responsive public layout for `PRODUCT_NAME` and
`PRODUCT_DESCRIPTION`. Add landing, login, registration, forgot-password,
reset-password, verify-email, and OAuth callback routes. Include keyboard
focus, labels, validation space, indeterminate loading states, empty states,
and inline/server error regions. Do not connect authentication yet and do not
install any auth or backend SDK.

Stop after public pages. List every file changed and any dependency added.

## Step 2 — Authenik8 client and provider

Configure `VITE_AUTHENIK8_API_URL=AUTHENIK8_API_URL` and
`VITE_APP_URL=FRONTEND_URL`. Import `createAuthenik8Client` from
`CLIENT_PACKAGE`, using `CLIENT_SOURCE` as the source reference. Create exactly
one client instance and an AuthProvider that represents `loading`,
`authenticated`, `unauthenticated`, and `error`.

On startup call `client.auth.restore()`. Subscribe to authentication loss.
Store only the public user projection in UI state. Do not create a second
login, session, token-refresh, CSRF, or fetch implementation.

Stop after provider wiring and show how startup restoration is tested.

## Step 3 — complete unauthenticated lifecycle

Connect registration, login, current user, verification/resend, forgot/reset
password, logout, Google OAuth, and GitHub OAuth using only documented client
methods and `OPENAPI_FILE`. Exchange the OAuth callback’s short-lived `code`
once, then remove it from the URL. It is not a token.

Render field errors, safe server messages, loading/disabled states, recovery
success, and OAuth failure. Never hide confirmed server failures during
development.

Stop and test successful and failed variants of every flow.

## Step 4 — protected application shell

Add an authenticated dashboard and Projects list/detail/create/edit screens.
Wait for restoration before routing. Preserve intended in-app navigation as
ordinary memory state. Use role-aware navigation, but make clear in code
comments that API authorization remains the boundary.

Stop after an ordinary user can use Projects and an unauthenticated request is
rejected by the API.

## Step 5 — account security

Add profile, change-password, linked-providers/unlink, and active-session
screens. Support revoke one session and revoke all other sessions. If the
current session is revoked or password change signs the user out, clear UI
state and navigate to login. Do not allow unlinking the last sign-in method;
display the backend rejection.

Stop after refresh, failed refresh, logout, and session revocation are tested.

## Step 6 — administrator UI

For a backend-issued `ADMIN`, add user list/detail, role/status controls,
session revocation, and audit events. Hide admin navigation from ordinary
users for usability, but always call the protected API. Add a test proving an
ordinary user receives `403` from an admin endpoint even if the route is
opened manually.

Stop and report the exact API response for the ordinary-user test.

## Step 7 — acceptance and confirmed fixes

Run every item in `integrations/lovable/acceptance-checklist.md` and the
Authenik8 Lovable validator. Fix only confirmed failures. Do not weaken cookie,
CORS, Origin, CSRF, OAuth-state, token-storage, or backend authorization rules
to make a preview pass.

Report remaining limitations, dependency audit results, and every file changed.
