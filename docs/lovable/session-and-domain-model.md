# Lovable session and domain model

## Supported production layouts

The first supported and recommended external-frontend layout is:

```text
Frontend: https://app.example.com
Backend:  https://api.example.com
```

Both origins use HTTPS and the same registrable site. Configure
`WEB_ORIGIN=https://app.example.com`, use
`VITE_AUTHENIK8_API_URL=https://api.example.com` in the frontend, and register
provider callbacks such as
`https://api.example.com/api/auth/oauth/google/callback`.

A same-origin reverse-proxy layout is also supported:

```text
Frontend: https://example.com
Backend:  https://example.com/api
```

Route `/api`, `/.well-known/jwks.json`, and OAuth callbacks to the Authenik8
API. Route application pages and assets to the frontend.

## Lovable preview limitation

This layout is not supported for the complete authenticated lifecycle:

```text
Frontend: https://project-name.lovable.app
Backend:  https://api.example.com
```

It is cross-site. The generated refresh and CSRF cookies are
`SameSite=Strict`, so browsers do not send them as a cross-site session
mechanism. Password login may appear to return an access token, but refresh,
logout, and OAuth completion cannot be treated as reliable. Do not weaken the
cookie flags or expose a refresh token to make a preview work.

Use Lovable preview for public UI work. Use the same-site custom domain before
testing or claiming the authentication lifecycle.

## Required backend configuration

- `WEB_ORIGIN` must equal the exact frontend origin, without a path.
- `COOKIE_SECURE` must be `true` in a deployed environment; production also
  forces secure cookies.
- Google and GitHub redirect URIs must exactly match their corresponding API
  callback URLs.
- The reverse proxy must preserve HTTPS information and only trusted proxy
  CIDRs should be configured.
- Credentialed CORS must never use a wildcard.

The generated cookies are host-only, `HttpOnly`, `SameSite=Strict`, and scoped
to `/api`. Logout clears a cookie using the same attributes. Frontend code can
read neither the refresh cookie nor the CSRF cookie; it receives only the
signed CSRF header value from `/api/auth/csrf`.

## Validation status

The repository tests exact-origin rejection, CSRF enforcement, cookie
attributes, session rotation, replay rejection, logout, and server-side admin
authorization. Cross-browser deployment testing of a real Lovable custom
domain remains a release gate. Until Safari, Chromium, and Firefox have been
exercised against the deployed reference application, this document is the
supported design decision rather than a claim that external browser validation
is complete.

## Browser test matrix

Repository automation proves cookie attributes, exact-origin decisions,
rotation/replay behavior, and backend authorization. The generated acceptance
checklist records real Chromium, Firefox, and Safari results for a deployment.
Until that matrix is completed for the release domains, `lovable.app` preview
remains explicitly unsupported for full sessions and the same-site layouts
above are the only supported design.
