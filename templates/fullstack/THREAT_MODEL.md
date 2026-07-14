# Threat model

## Protected assets

Account credentials, OAuth identities, access and refresh tokens, administrative actions, user profile data, and owned Project records.

## Trust boundaries

The browser is untrusted. React route guards provide navigation behavior only. Express middleware and module policies make every authorization decision. PostgreSQL and Redis must be reachable only from trusted application networks.

## Threats addressed

- Refresh-token theft and replay: restricted HttpOnly cookies, Redis-backed rotation, atomic replacement, and replay rejection.
- Cross-site cookie abuse: exact-origin checks on refresh, logout, OAuth exchange, and other cookie-driven mutations.
- Token exfiltration through browser storage: access tokens remain in module memory; refresh tokens are never exposed to JavaScript.
- Broken object authorization: every Project lookup or mutation is scoped by owner unless an explicit administrator policy allows it.
- Privilege escalation: admin APIs require authenticated server-side role checks and record audit events.
- Account enumeration: login and recovery responses are generic.
- OAuth login CSRF: provider state is handled by Authenik8; the SPA receives only a single-use, short-lived exchange code.
- Password database compromise: passwords and recovery/verification tokens are stored as one-way hashes.
- Basic abuse and injection: Authenik8 rate limiting, request size limits, Zod validation, Prisma parameterization, security headers, and structured logging.

## Residual risks

An active XSS can make authenticated API calls while the page is open even though it cannot read the refresh cookie. Keep the content security policy strict and audit third-party scripts. Access tokens remain valid until their short expiry after some session revocations. OAuth provider compromise, malicious dependencies, host compromise, denial of service at volumes beyond one Redis limiter, and mistakes in deployment infrastructure require controls outside this starter.

## Review triggers

Repeat the threat review when adding a new identity provider, changing cookie scope or origins, introducing file uploads or billing, adding multiple tenants, exposing Redis, changing proxy topology, or adding third-party browser scripts.
