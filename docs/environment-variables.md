# Environment variables

The CLI creates a git-ignored `.env` with a unique ES256 signing key and refresh secret. Move those values into your deployment secret manager. Never commit the private JWK.

## Express API presets

```dotenv
DATABASE_URL=file:./dev.db
AUTHENIK8_SIGNING_JWKS='[{"kty":"EC","crv":"P-256","kid":"<key-id>","x":"...","y":"...","d":"...","alg":"ES256"}]'
AUTHENIK8_ACTIVE_KID=<key-id>
AUTHENIK8_ISSUER=http://localhost:3000
AUTHENIK8_AUDIENCE=my-app-api
REFRESH_SECRET=<generated-random-secret>
AUTHENIK8_AGENTS={}
REDIS_URL=memory://
```

`REDIS_URL=memory://` selects the local in-process store. Use a `redis://` or `rediss://` URL for an external service. When `REDIS_URL` is omitted, `REDIS_HOST`, `REDIS_PORT`, and optional `REDIS_PASSWORD` remain supported. Express presets reject `memory://` when `NODE_ENV=production`.

For password and OAuth, also configure each enabled provider:

```dotenv
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback
```

## Fullstack preset

```dotenv
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/authenik8?schema=public
REDIS_URL=memory://
AUTHENIK8_LOCAL_DATABASE=embedded
AUTHENIK8_SIGNING_JWKS='[{"kty":"EC","crv":"P-256","kid":"<key-id>","x":"...","y":"...","d":"...","alg":"ES256"}]'
AUTHENIK8_ACTIVE_KID=<key-id>
AUTHENIK8_ISSUER=http://localhost:3000
AUTHENIK8_AUDIENCE=my-app-api
REFRESH_SECRET=<generated-random-secret>
AUTHENIK8_AGENTS={}
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/oauth/github/callback
```

`AUTHENIK8_AGENTS={}` keeps agent identity disabled. Enabling it requires a validated agent-to-scope registry and a trusted workload-authentication boundary. OAuth variables are generated only for selected providers. The fullstack `.env.example` also documents cookie, proxy, logging, mail delivery, and seed administrator settings.

The fullstack preset starts project-local PostgreSQL automatically and stores
its data under `.authenik8/`. `memory://` selects an in-process Redis-compatible
store for local auth state. Set `AUTHENIK8_LOCAL_DATABASE=external` when
`DATABASE_URL` points to a database you manage. Production must use external
PostgreSQL and a `redis://` or `rediss://` URL.

[Back to the documentation index](../README.md#documentation)
