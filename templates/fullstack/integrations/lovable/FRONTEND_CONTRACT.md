# Authenik8 frontend contract

This contract is the source of truth for a Lovable-generated frontend.
Authenik8 remains the identity and authorization authority. Do not create a
second backend, authentication provider, users table, or sessions table.

## API and client

- Machine-readable contract: `integrations/lovable/openapi.json`
- Generated client source: `packages/api-client/src/index.ts`
- Workspace package: `@authenik8/api-client`
- Local API origin: `http://localhost:3000`
- Production API example: `https://api.example.com`

Only call paths and methods present in `openapi.json`. The current API exposes
`GET /api/auth/me` for session restoration and `GET /api/account/profile` for
account settings. Provider unlink and “revoke other sessions” are supported
through the generated client and protected backend endpoints.

## Authentication lifecycle

1. On application startup, show an indeterminate loading state and attempt one
   refresh through the generated client.
2. A successful login or OAuth exchange returns `{ accessToken, user }`. The
   client keeps the access token in memory and the UI stores only the user
   projection.
3. Send the access token as `Authorization: Bearer <token>` for protected API
   requests.
4. The API sets and rotates the refresh token as an HttpOnly cookie. Frontend
   code never reads, copies, or persists it.
5. Before a mutation, the client obtains `/api/auth/csrf`, sends the returned
   value in `X-CSRF-Token`, and uses `credentials: "include"`.
6. One eligible `401` may trigger one shared refresh request and one retry.
   Never create a refresh loop or parallel refresh storm.
7. If refresh fails, clear the current UI user and route to login. Preserve the
   intended in-app destination as ordinary UI state, not in an auth token.
8. Logout is complete when local in-memory state is cleared, even if the
   network request fails. Surface the network failure during development.

Loading, authenticated, unauthenticated, and error are separate states. Do not
render a protected page while startup restoration is unresolved.

## OAuth

Start sign-in by navigating the browser to
`/api/auth/oauth/google` or `/api/auth/oauth/github`. The backend owns provider
state and callbacks.

After success, the backend redirects to `/auth/callback?code=...` on the exact
configured frontend origin. The value is a short-lived, single-use exchange
code, not an access or refresh token. Immediately exchange it through
`POST /api/auth/oauth/exchange`, replace the URL with a clean application URL,
and handle failure as unauthenticated.

Do not construct provider authorization URLs, handle provider secrets, or
accept an arbitrary callback destination in the frontend.

## Response and error shapes

Authenticated responses return the public user:

```ts
type User = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  verified: boolean;
  createdAt: string;
};
```

API failures use:

```ts
type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
  requestId?: string;
};
```

Use `fields` next to the relevant form controls and preserve `requestId` in
development diagnostics. Show safe, useful messages to users. Do not display
raw stack traces or production internals.

## Roles, permissions, and route guards

`USER` and `ADMIN` are backend-issued roles. Route guards may choose what to
render, but they are only navigation and user-experience controls.

The current API exposes verification and the public user includes `verified`,
but application routes do not yet require a verified email. The UI may prompt
for verification; it must not claim that unverified users are blocked from
protected data unless a backend policy is added and documented.

- Protected user pages require a restored authenticated user.
- Admin navigation may be shown only when `user.role === "ADMIN"`.
- The API must still be called for protected data.
- Treat `401` as lost or invalid authentication.
- Treat `403` as authenticated but not authorized.
- Never grant access from editable client state, URL parameters, hidden
  controls, or local storage.

Every admin endpoint is protected by server middleware. An ordinary user must
receive `403` from the admin API even if they manually navigate to an admin
route.

## Sessions

`GET /api/account/sessions` returns:

```ts
type Session = {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};
```

Revocation uses `DELETE /api/account/sessions/{id}`. Use
`DELETE /api/account/sessions` to revoke every session except the current one.
If `current` is revoked, the refresh cookie is cleared and the UI must become
unauthenticated.

## Administration

The paginated user collection is:

```ts
type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
```

Users have the `User` shape above. `GET /api/admin/users/{id}` returns one user.
`PATCH /api/admin/users/{id}` accepts a role, a status, or both. The backend
rejects self-lockout. Audit pages use the same pagination shape and include
`id`, `action`, `actorEmail`, `targetType`, `targetId`, and `createdAt`.

## Example project resource

```ts
type Project = {
  id: string;
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};
```

The backend filters lists and applies owner/admin policy to reads and writes.
A `404` may deliberately mean either missing or unauthorized; do not infer
resource existence.

## Network, CORS, and domains

- Use a reasonable request timeout for ordinary reads and mutations. Do not
  automatically retry mutations.
- Retry a transient read only when the user can safely repeat it. Authentication
  refresh has its own single-attempt rule.
- Production should use `https://app.example.com` for the frontend and
  `https://api.example.com` for the API, or a same-origin reverse proxy.
- The backend allowlists one exact `WEB_ORIGIN` and credentialed CORS never
  uses `*`.
- A `*.lovable.app` preview is cross-site from `api.example.com` and is not a
  supported complete session layout with the secure `SameSite=Strict` cookie.
- Use a same-site custom domain for authentication testing and production.
