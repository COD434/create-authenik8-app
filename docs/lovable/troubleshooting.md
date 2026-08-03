# Lovable integration troubleshooting

## Lovable created Supabase or Cloud auth

Stop prompting, revert that diff, remove the auth SDK and generated
users/sessions tables, then restart from prompt step 2. Do not try to synchronize
two identity stores.

## Refresh cookie is absent

Check HTTPS, exact `WEB_ORIGIN`, client `credentials: "include"`, the cookie’s
`/api` path, and whether the frontend/API are same-site. A `lovable.app`
preview is cross-site and is not supported for the complete session lifecycle.

## Preflight fails

Compare the browser Origin byte-for-byte with `WEB_ORIGIN`. Do not add `*`.
Confirm the request uses documented methods/headers and that a proxy is not
answering OPTIONS before Express.

## Login succeeds but refresh fails

Login can return an in-memory access token even when strict cookies are
blocked. Inspect Set-Cookie and the subsequent `/api/auth/refresh` request.
Move testing to same-site custom domains; do not expose a refresh token.

## OAuth returns to the wrong domain or reports redirect mismatch

Set `WEB_ORIGIN` to the frontend origin and make the provider callback exactly
match the backend `*_REDIRECT_URI`. The provider callback is on the API domain,
not the Lovable domain.

## User appears logged in after logout

Clear UI state in a `finally` path, verify the backend logout reached the
active session, and inspect the matching cookie-clear attributes. A stale
screen is not proof that the server session remains valid; test refresh.

## Ordinary user sees an admin page

Hide navigation for usability, then call an admin API. A `403` proves backend
authorization. If it returns data, treat it as a backend security failure;
route guards cannot repair it.

## Repeating 401 requests

Use one generated client instance. Do not add interceptors around it. Confirm
there is one shared refresh and one retry, then clear auth state on failure.

## Lovable overwrote the client

Revert the client changes, re-export with `npm run export:lovable-client`, and
add ownership/review rules for `vendor/` and the integration wrapper.

## Preview and custom domain behave differently

This is expected for cross-site cookies. Validate public visuals in preview
and the entire auth lifecycle on the custom same-site domain.

## `import.meta.env` is undefined

Use a `VITE_` prefix, configure it in the frontend build environment, and
rebuild. Do not use `VITE_` for secrets.

## Direct navigation returns 404

Configure the frontend host’s SPA fallback to `index.html`. Exclude `/api` and
JWKS paths when frontend and API share a reverse proxy.

## GitHub sync changed generated files

Lovable sync is bidirectional on the connected default branch. Revert the
commit, split future prompt steps, and review each diff before the next prompt.
