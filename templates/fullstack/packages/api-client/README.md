# Authenik8 API client

The official browser client for the generated Authenik8 API. It keeps access
tokens in memory, sends refresh and CSRF cookies with `credentials: "include"`,
serializes refresh requests, and shares refreshed access tokens between tabs
without writing credentials to browser storage.

## Lovable or another separate frontend

Build this package and make it available to the frontend through a private
package, GitHub dependency, or copied `dist` directory:

```bash
npm --workspace @authenik8/contracts run build
npm --workspace @authenik8/api-client run build
```

Create one client at application startup:

```ts
import { createAuthenik8Client } from "@authenik8/api-client";

export const authenik8 = createAuthenik8Client({
  baseUrl: import.meta.env.VITE_AUTHENIK8_API_URL,
});
```

`baseUrl` accepts an API origin such as `https://api.example.com`, that origin
with `/api`, `/api` for a reverse proxy, or an empty value for the generated
same-origin setup.

Restore the cookie-backed session when the app mounts:

```ts
const restored = await authenik8.auth.restore();
const user = restored?.user ?? null;
```

Sign in and call protected resources:

```ts
const { user } = await authenik8.auth.login({ email, password });
const { projects } = await authenik8.projects.list();
```

Do not copy the token into local storage, session storage, IndexedDB, URL
parameters, analytics, or logs. The client owns the in-memory access token.

## Public API

- `auth`: registration, login, restore/refresh, logout, email verification,
  password recovery, and OAuth exchange
- `account`: profile, password, and linked OAuth providers
- `sessions`: list, revoke one, or revoke all other sessions
- `projects`: the generated reference CRUD resource
- `admin`: user detail/list/update/session revocation and audit events
- `health.status()`: readiness status
- `subscribe(listener)`: authentication-state notifications
- `onAuthenticationLost(listener)`: forced sign-out notifications

Every request may throw `ApiError` with `status`, stable `code`, `message`, and
optional validation `fields`.
