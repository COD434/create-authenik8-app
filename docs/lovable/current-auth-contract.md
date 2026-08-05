# Current Authenik8 contract for Lovable

This document records the generated full-stack application as implemented. It
is an audit of the current code, not a wishlist for frontend generators.

## Runtime baseline

- Node.js: `^20.19 || ^22.12 || >=24`
- Package manager: npm workspaces
- Local development: project-local PostgreSQL and in-process Redis-compatible
  state are started by `npm run dev`; Docker is optional.
- Production: external PostgreSQL, an external `redis://` or `rediss://`
  service, HTTPS, and an exact frontend origin are required.
- Default local frontend: `http://localhost:5173`
- Default local API: `http://localhost:3000`
- API prefix: `/api`, except for the public JWKS route.

## Mounted HTTP surface

The implementation source is `templates/fullstack/apps/api/src/app.ts` and its
mounted routers. Every path below is present in the generated application.

| Method | Path | Authentication and purpose |
| --- | --- | --- |
| GET | `/.well-known/jwks.json` | Public ES256 verification keys |
| GET | `/api/health/live` | Public process liveness |
| GET | `/api/health/ready` | Public PostgreSQL and Redis readiness |
| GET | `/api/docs/openapi.json` | Public OpenAPI 3.1 document |
| GET | `/api/auth/csrf` | Public; issues a signed CSRF cookie and returns the matching header token |
| POST | `/api/auth/register` | Origin + CSRF; creates an unverified account |
| POST | `/api/auth/login` | Origin + CSRF; creates a session |
| POST | `/api/auth/refresh` | Origin + CSRF + refresh cookie; rotates the session |
| POST | `/api/auth/logout` | Origin + CSRF + refresh cookie; revokes the session |
| GET | `/api/auth/me` | Bearer access token + active session |
| POST | `/api/auth/forgot-password` | Origin + CSRF; enumeration-safe response |
| POST | `/api/auth/reset-password` | Origin + CSRF; consumes a single-use reset token |
| POST | `/api/auth/verify-email` | Origin + CSRF; consumes a single-use verification token |
| POST | `/api/auth/resend-verification` | Bearer + active session + origin + CSRF |
| GET | `/api/auth/oauth/{provider}` | Public; starts Google or GitHub sign-in |
| POST | `/api/auth/oauth/{provider}/link-intent` | Bearer + active session + origin + CSRF |
| GET | `/api/auth/oauth/{provider}/link` | Public; consumes a short-lived link ticket and redirects |
| GET | `/api/auth/oauth/{provider}/callback` | Provider callback; redirects to the configured frontend |
| POST | `/api/auth/oauth/exchange` | Origin + CSRF; exchanges a single-use callback code for a session |
| GET | `/api/account/profile` | Bearer + active session |
| PATCH | `/api/account/profile` | Bearer + active session + origin + CSRF |
| PUT | `/api/account/password` | Bearer + active session + origin + CSRF; revokes every session |
| GET | `/api/account/sessions` | Bearer + active session |
| DELETE | `/api/account/sessions` | Bearer + active session + origin + CSRF; revokes every other session |
| DELETE | `/api/account/sessions/{id}` | Bearer + active session + origin + CSRF |
| GET | `/api/account/providers` | Bearer + active session |
| DELETE | `/api/account/providers/{provider}` | Bearer + active session + origin + CSRF; preserves at least one login method |
| GET | `/api/projects` | Bearer + active session; backend-filtered list |
| POST | `/api/projects` | Bearer + active session + origin + CSRF |
| GET | `/api/projects/{id}` | Bearer + active session + backend ownership/admin policy |
| PATCH | `/api/projects/{id}` | Bearer + active session + origin + CSRF + backend policy |
| DELETE | `/api/projects/{id}` | Bearer + active session + origin + CSRF + backend policy |
| GET | `/api/admin/users` | Bearer + active session + server-enforced `ADMIN` role |
| GET | `/api/admin/users/{id}` | Admin; returns one public user projection |
| PATCH | `/api/admin/users/{id}` | Admin + origin + CSRF |
| DELETE | `/api/admin/users/{id}/sessions` | Admin + origin + CSRF |
| GET | `/api/admin/audit` | Admin |

The API deliberately has no user-deletion endpoint. A Lovable frontend must
not invent calls beyond `openapi.json`. Use `GET /api/auth/me` for session
restoration and `GET /api/account/profile` for account settings.

## OpenAPI audit

Before the Lovable contract work, the dynamic document covered every
`/api` router operation but did not describe `/.well-known/jwks.json`. Its
relative `/api` server also made the root JWKS path impossible to express
accurately. The updated document uses origin-level server examples and exact
mounted paths, includes the JWKS response, and marks active-session,
credentialed-cookie, and administrator requirements.

`npm run openapi:generate` writes the canonical deterministic artifact to
`apps/api/openapi.json`. Projects generated with `--frontend lovable` also
receive an identical `integrations/lovable/openapi.json` export. `npm run
openapi:check` fails if any applicable artifact is stale and validates each one
as OpenAPI 3.1.

## Generated client surface

`packages/api-client/src/index.ts` exports
`createAuthenik8Client({ baseUrl, fetch, broadcastChannelName })`. Its public
groups cover:

- `auth`: registration, login, refresh/restore, logout, current user,
  verification, recovery, and OAuth;
- `account`: get/update profile, change password, linked providers, unlink,
  and provider-link start;
- `sessions`: list, revoke one, and revoke all others;
- `projects`: list, get, create, update, and remove;
- `admin.users`: list, detail, status/role/general update, and session
  revocation;
- `admin.audit.list` and `health.status`;
- auth-state and authentication-loss subscriptions.

Compatibility exports (`authApi`, `accountApi`, `projectApi`, `adminApi`,
`healthApi`, and `apiFetch`) keep the included React app working.

The factory accepts an HTTP(S) API origin, that origin ending in `/api`, `/api`,
or an empty same-origin value. It emits ESM plus TypeScript declarations and
uses no Node-only browser dependency.

## Token and session behavior

- Login and OAuth exchange return the short-lived access token in JSON.
- The client holds the access token in a module-scoped variable only.
- The access token is not written to local storage, session storage, IndexedDB,
  cookies, or a URL.
- The refresh token is sealed with AES-256-GCM and set in
  `authenik8_refresh`; it is never returned to frontend JavaScript.
- The refresh cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api`, valid
  for seven days, and `Secure` in production or when `COOKIE_SECURE=true`.
- The CSRF cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api`, and
  `Secure` under the same conditions. The API returns a signed value for the
  `X-CSRF-Token` header.
- Client requests use `credentials: "include"`.
- One eligible authenticated `401` starts one shared refresh promise. A
  successful refresh retries the original request once.
- Concurrent tabs coordinate through `BroadcastChannel`; a server-side
  refresh lock produces `409 REFRESH_IN_PROGRESS` for the losing request.
- Refresh failure clears in-memory authentication. It is not retried
  indefinitely.
- Logout revokes the matching PostgreSQL and Authenik8-core session, then
  clears the cookie. The client clears in-memory state even if the network
  request fails.
- Password reset and password change revoke all sessions.
- Session revocation is enforced by both the application session record and
  the Redis-backed Authenik8 identity engine.
- Email verification is implemented, but the current project and account
  routes do not reject an otherwise active session whose email remains
  unverified. A frontend must not claim that verification is enforced for
  protected data until the backend policy is added.

## CORS, Origin, and OAuth behavior

`WEB_ORIGIN` is the single exact allowed browser origin. A trailing slash is
normalized, while paths, query strings, fragments, credentials, wildcard
origins, `null`, and lookalike hosts are rejected. Production requires HTTPS.
Credentialed CORS reflects only that origin; it never uses `*`. Every browser
mutation also requires that exact `Origin` header before CSRF validation.

Google and GitHub callbacks are configured explicitly. Successful OAuth
sign-in stores the session payload server-side for 60 seconds, redirects to
`WEB_ORIGIN/auth/callback?code=...`, and requires a one-time exchange. The URL
contains no access or refresh token. Provider linking uses a separate
single-use, two-minute ticket. OAuth errors return to
`WEB_ORIGIN/login?oauthError=1`.

There is no arbitrary post-login return URL, so the current callback does not
create an open redirect. Administrator middleware runs on the API before every
admin controller; hiding an admin page in the frontend does not grant or
remove authorization.
