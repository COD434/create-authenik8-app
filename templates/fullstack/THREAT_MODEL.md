# Threat model

## Protected assets

Account credentials, OAuth identities, access and refresh tokens, agent grants and M2M sessions, delegated actor chains, administrative actions, user profile data, and owned Project records.

## Trust boundaries

The browser is untrusted. React route guards provide navigation behavior only. Express middleware and module policies make every authorization decision. PostgreSQL and Redis must be reachable only from trusted application networks.

## Threats addressed

- Refresh-token theft and replay: AES-256-GCM-sealed HttpOnly cookies, Redis-backed rotation, atomic replacement, and replay rejection.
- Cross-site cookie abuse: exact-origin checks and signed double-submit CSRF tokens on browser mutations.
- Token exfiltration through browser storage: access tokens remain in module memory; refresh tokens are never exposed to JavaScript.
- Broken object authorization: every Project lookup or mutation is scoped by owner unless an explicit administrator policy allows it.
- Privilege escalation: admin APIs require authenticated server-side role checks and record audit events.
- Account enumeration: login and recovery responses are generic.
- OAuth login CSRF: provider state is handled by Authenik8; the SPA receives only a single-use, short-lived exchange code.
- Password database compromise: passwords and recovery/verification tokens are stored as one-way hashes.
- Basic abuse and injection: Redis-backed Authenik8 rate limiting, request size limits, Zod validation, Prisma parameterization, security headers, and structured logging.
- Agent identity: human and machine token purposes are separated, exact scopes are checked against the live registry, M2M sessions are revocable, and delegated tokens remain bound to their human session.

## Residual risks

An active XSS can make authenticated API calls while the page is open even though it cannot read the refresh cookie. Keep the content security policy strict and audit third-party scripts. Access tokens remain valid until their short expiry after some session revocations. Agent-token issuance is privileged but does not authenticate the workload for you; use mTLS, cloud workload identity, or signed assertions and never expose an unauthenticated mint route. Public JWKS verification cannot observe Redis agent revocation. OAuth provider compromise, malicious dependencies, host compromise, denial of service at volumes beyond one Redis limiter, and mistakes in deployment infrastructure require controls outside this starter.

## Review triggers

Repeat the threat review when adding a new identity provider or agent, changing agent scopes or delegation policy, changing cookie scope or origins, introducing file uploads or billing, adding multiple tenants, exposing Redis, changing proxy topology, or adding third-party browser scripts.
