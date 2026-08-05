# CORS, Origin, and cookies

## Exact origin

`WEB_ORIGIN` is one HTTP(S) origin. A trailing slash is normalized; paths,
query strings, fragments, credentials, wildcard `*`, `null`, lookalike hosts,
and unconfigured ports are rejected.

Credentialed CORS reflects only the approved origin. Public non-browser
requests may omit Origin, while cookie-driven mutation routes explicitly
require it before CSRF validation.

The generated client sends `credentials: "include"` and obtains a signed CSRF
header token before mutations. Do not replace this behavior with a generic
fetch wrapper.

## Cookies

Refresh and CSRF cookies are:

- HttpOnly;
- SameSite=Strict;
- scoped to `/api`;
- host-only;
- Secure in production or when `COOKIE_SECURE=true`.

Logout clears the refresh cookie with matching attributes. The cookie domain
and SameSite mode are intentionally not loosened automatically.

## Layout consequences

`app.example.com` and `api.example.com` are cross-origin but same-site, so
strict cookies can support the intended lifecycle over HTTPS. A Lovable
`*.lovable.app` preview and `api.example.com` are cross-site; browser
third-party-cookie restrictions make full refresh/logout/OAuth behavior
unreliable. Use the preview for public UI work and a custom same-site domain
for authentication.

## Reverse proxies

Forward `/api`, `/.well-known/jwks.json`, and OAuth callbacks to the API.
Preserve the original host and HTTPS information. Configure trust proxy only
with known proxy CIDRs; do not trust every address. Ensure SPA navigation
falls back to `index.html` only on the frontend, not for API paths.
