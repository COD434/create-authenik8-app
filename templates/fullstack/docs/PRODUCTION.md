# Production checklist

## Secrets and transport

- Store the generated ES256 signing key ring and high-entropy `REFRESH_SECRET` in a deployment secret manager. Never commit private JWK fields.
- Rotate access-token keys with `npx create-authenik8-app@latest ops rotate signing-key`. Stage and deploy the new key ring to every instance before activating the staged key; this prevents cross-instance verification failures during a rolling deployment. Retain old public keys until every token they signed has expired.
- Terminate TLS at a maintained reverse proxy or load balancer and redirect HTTP to HTTPS.
- Set `COOKIE_SECURE=true` and an exact HTTPS `WEB_ORIGIN`. Set `TRUSTED_PROXY_CIDRS` to the comma-separated networks of proxies that overwrite forwarding headers; leave it empty when requests reach the app directly.

## Data services

- Keep PostgreSQL and Redis on private networks with authentication and encryption where supported.
- Configure automated PostgreSQL backups and perform restore drills.
- Configure Redis persistence appropriate to the session availability requirement. Never expose port 6379 publicly.
- Treat PostgreSQL as the application session authority and Redis/Authenik8 as the token engine. Do not remove the active PostgreSQL session check from authenticated middleware; it is the fail-closed boundary when cross-store revocation is only partially available.
- Keep `AUTHENIK8_AGENTS={}` unless machine identity is intentionally enabled. In production, prefer a database-backed registry and authenticate workloads with mTLS, cloud identity, or signed assertions before issuing tokens.
- Run Prisma migrations as a controlled release step, not concurrently from every application replica.

## Identity operations

- Run `npx create-authenik8-app@latest ops readiness` before deployment and retain the private report from `ops audit production` with the release evidence.
- Replace the development token output with a transactional email provider before accepting real users.
- Register exact OAuth callback URLs and rotate provider secrets through a secret manager.
- Supply `SEED_ADMIN_PASSWORD` through a secret manager when seeding, then rotate the administrator credential or remove the seed account after first deployment.
- Keep Authenik8 as the sole OAuth identity resolver through the Prisma identity adapter. Review any change to automatic email linking as an account-takeover-sensitive policy change.

## Runtime and observability

- Run `npm run build`, then start with `NODE_ENV=production npm start`.
- Send structured logs to centralized storage and preserve `x-request-id` across the proxy.
- Monitor `/api/health/live` and `/api/health/ready`, request latency, rate-limit responses, Redis availability, login failures, and refresh replay failures.
- Alert on administrator role changes and session revocation spikes.
- Review dependency advisories and apply security updates with the full test suite.
