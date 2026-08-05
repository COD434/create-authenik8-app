# Deploy Lovable with an Authenik8 API

The first documented recipe uses a Lovable-hosted frontend at
`app.example.com` and an Authenik8 API on Railway at `api.example.com`.
PostgreSQL and Redis are separate managed Railway services.

Railway’s current JavaScript-monorepo support builds shared workspaces from the
repository root and allows a custom start command per service. Lovable supports
custom subdomains with HTTPS after publishing. Verify the current provider
screens against the [Railway monorepo documentation](https://docs.railway.com/deployments/monorepo)
and [Lovable custom-domain documentation](https://docs.lovable.dev/features/custom-domain).

## DNS and HTTPS

1. Publish the frontend in Lovable.
2. In Lovable, open Project → Settings → Domains, connect
   `app.example.com`, and add the exact DNS records Lovable displays. Wait for
   the status to become Live and set it as primary.
3. In Railway’s API service, add the custom domain `api.example.com`. Add the
   CNAME Railway displays.
4. Wait until both services present valid HTTPS certificates before enabling
   production sessions.

Do not copy example record targets from this guide; provider targets are
project-specific.

## Railway services

Create one Railway project with:

- the generated GitHub repository as the API service;
- managed PostgreSQL;
- managed Redis.

Use the repository root for the shared npm workspace. Configure:

```text
Build command: npm ci && npm run build
Start command: npm start
Healthcheck:   /api/health/ready
```

The API already binds to Railway’s injected `PORT`. Set database and Redis
service references using the values Railway exposes; do not make Redis public.
Railway healthchecks require a `200` before traffic moves to a deployment, as
described in its [healthcheck documentation](https://docs.railway.com/deployments/healthchecks).

Apply Prisma migrations as a controlled release step:

```bash
npm run db:migrate:apply
```

Back up the database before a destructive migration.

## API variables

Set real values in Railway, never in the Lovable repository:

```dotenv
NODE_ENV=production
WEB_ORIGIN=https://app.example.com
AUTHENIK8_ISSUER=https://api.example.com
AUTHENIK8_AUDIENCE=authenik8-fullstack-api
DATABASE_URL=<Railway PostgreSQL reference>
REDIS_URL=<Railway Redis reference>
AUTHENIK8_SIGNING_JWKS=<generated private signing JWKS>
AUTHENIK8_ACTIVE_KID=<active key id>
REFRESH_SECRET=<at least 32 random characters>
COOKIE_SECURE=true
TRUSTED_PROXY_CIDRS=<only the documented Railway proxy ranges you trust>
EMAIL_FROM=Authenik8 <auth@example.com>
RESEND_API_KEY=<mail provider secret>
GOOGLE_CLIENT_ID=<provider value>
GOOGLE_CLIENT_SECRET=<provider secret>
GOOGLE_REDIRECT_URI=https://api.example.com/api/auth/oauth/google/callback
GITHUB_CLIENT_ID=<provider value>
GITHUB_CLIENT_SECRET=<provider secret>
GITHUB_REDIRECT_URI=https://api.example.com/api/auth/oauth/github/callback
```

Do not set `TRUSTED_PROXY_CIDRS=*`. If the exact provider proxy ranges are not
known, leave trust proxy disabled and validate the deployment behavior before
adding a scoped value.

## Lovable variables

These values are public:

```dotenv
VITE_AUTHENIK8_API_URL=https://api.example.com
VITE_APP_URL=https://app.example.com
```

No OAuth secret, database/Redis URL, private JWK, or refresh secret belongs in
Lovable.

## Provider callbacks

Register exactly:

```text
https://api.example.com/api/auth/oauth/google/callback
https://api.example.com/api/auth/oauth/github/callback
```

The post-login frontend destination is controlled by `WEB_ORIGIN`; do not add
an arbitrary return URL.

## Verify and roll back

Before switching DNS:

```bash
curl https://api.example.com/api/health/live
curl https://api.example.com/api/health/ready
npm run doctor:lovable -- /path/to/frontend --runtime \
  --api-url https://api.example.com --origin https://app.example.com
```

Complete the generated acceptance checklist. If a release fails, roll the API
service back to the last healthy deployment, roll the frontend back through
Lovable/GitHub, and restore the database only if a migration requires it.
Disconnecting Lovable from GitHub stops two-way sync but does not remove the
GitHub repository or any Authenik8 service, database, session, or secret.
