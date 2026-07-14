# Production checklist

## Secrets and transport

- Generate independent high-entropy `JWT_SECRET` and `REFRESH_SECRET` values. Do not reuse development values.
- Terminate TLS at a maintained reverse proxy or load balancer and redirect HTTP to HTTPS.
- Set `COOKIE_SECURE=true`, an exact HTTPS `WEB_ORIGIN`, and `TRUST_PROXY=true` only when requests pass through a trusted proxy that overwrites forwarding headers.

## Data services

- Keep PostgreSQL and Redis on private networks with authentication and encryption where supported.
- Configure automated PostgreSQL backups and perform restore drills.
- Configure Redis persistence appropriate to the session availability requirement. Never expose port 6379 publicly.
- Run Prisma migrations as a controlled release step, not concurrently from every application replica.

## Identity operations

- Replace the development token output with a transactional email provider before accepting real users.
- Register exact OAuth callback URLs and rotate provider secrets through a secret manager.
- Change or remove the seed administrator password after the first deployment.

## Runtime and observability

- Run `npm run build`, then start with `NODE_ENV=production npm start`.
- Send structured logs to centralized storage and preserve `x-request-id` across the proxy.
- Monitor `/api/health/live` and `/api/health/ready`, request latency, rate-limit responses, Redis availability, login failures, and refresh replay failures.
- Alert on administrator role changes and session revocation spikes.
- Review dependency advisories and apply security updates with the full test suite.
