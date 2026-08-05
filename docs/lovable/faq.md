# Lovable integration FAQ

## Does this use Lovable Cloud authentication?

No. Lovable is the UI builder and optional frontend host. Authenik8 is the only
identity and backend authority.

## Why keep `apps/web`?

It is the tested React reference for every required lifecycle. The first
Lovable release deliberately keeps it while the replacement frontend is
validated.

## Can I use the `lovable.app` preview for login?

You can inspect visual and public behavior, but it is not supported for the
complete strict-cookie lifecycle with an API on another site. Use a same-site
custom domain.

## Where are tokens stored?

Access tokens stay in memory. Refresh tokens stay in an HttpOnly API cookie.
Neither belongs in localStorage, sessionStorage, IndexedDB, URLs, or logs.

## Are `VITE_*` variables secret?

No. They are public build-time values embedded in browser JavaScript.

## Does hiding admin UI enforce access?

No. It improves navigation only. The API requires an active administrator
session and returns `403` to ordinary users.

## How does a separate frontend consume the client?

Run `npm run export:lovable-client`, commit the two generated archives into the
frontend’s `vendor/` directory, and install them as local package files. The
included reference app uses the same packages through npm workspaces.

## Can I disconnect Lovable or GitHub later?

Yes. Disconnecting stops their sync relationship; it does not delete the
GitHub repository or the independently deployed Authenik8 backend, data, or
secrets.

## Is Lovable Doctor a security certification?

No. It is a focused static/runtime integration check used alongside backend
tests, dependency review, and the manual acceptance checklist.
