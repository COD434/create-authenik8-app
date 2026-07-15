# Authenik8 Generated App Threat Model

This document describes what a generated Authenik8 app is designed to help with, what it does not solve for you, and what you must configure before production use.

## System Boundary

A generated app includes:

- Express API routes.
- JWT access tokens.
- Redis-backed refresh-token rotation.
- Prisma database schema.
- Optional Google/GitHub OAuth.
- Authenik8 security middleware: Helmet, rate limiting, and optional IP whitelist.
- Optional PM2 production process config.
- Optional scoped identities for agents, workers, bots, and M2M callers.

External systems are outside the generated app boundary:

- Browser or mobile frontend.
- OAuth provider dashboards.
- Redis hosting.
- SQL database hosting.
- TLS termination and reverse proxy.
- Secret management.
- Email delivery, MFA, and password reset flows unless you add them.

## Assets Protected

- Access tokens.
- Refresh tokens.
- OAuth authorization state.
- OAuth identity records.
- User IDs, emails, roles, and provider links.
- Redis-backed session state.
- Admin-only routes.
- Agent registry grants, delegated actor chains, and M2M sessions.

## Trust Assumptions

- The active ES256 private JWK and `REFRESH_SECRET` are random, private, and stored outside source control.
- Redis is private to the app and not exposed to the public internet.
- Database credentials are private.
- OAuth callback URLs match provider dashboard settings exactly.
- Production traffic uses HTTPS.
- Reverse proxy headers are trusted only when you control the proxy.
- Developers validate and authorize their own business-domain routes.
- Applications authenticate workloads before calling privileged agent-token issuance and explicitly authorize every user delegation.

## Threats Addressed

### Refresh-token replay

Refresh tokens are stateful. The currently valid token for each session is stored under `refresh:<userId>:<sessionId>`. When a refresh succeeds, Authenik8-core atomically replaces it. Reusing an old refresh token fails and revokes that refresh family.

### Concurrent refresh abuse

Refresh requests acquire a Redis lock under `lock:<userId>:<sessionId>`. Two simultaneous refresh attempts for the same session cannot both rotate successfully.

### Stateless JWT logout limitations

Access-token sessions are persisted in Redis under `sessions:<userId>`. Admin helpers can list sessions and revoke one or all sessions for a user.

### Basic request flooding

`auth.rateLimit` uses Redis-backed rate limiting. Generated apps apply it globally by default.

### Common HTTP header risks

`auth.helmet` applies secure HTTP headers through Helmet.

### OAuth CSRF/state tampering

OAuth redirects generate random state and store it in Redis for five minutes under `oauth:state:<state>`. Callback handlers reject missing, invalid, or expired state.

### Duplicate OAuth identities

OAuth profiles are normalized into provider, provider ID, email, name, and email verification status. The Identity Engine checks provider and email records before creating a new identity.

### Unverified OAuth email token issuance

Provider callbacks verify the provider email before the Identity Engine issues an application session.

### Admin-route access

`auth.requireAdmin` checks for a valid JWT with `role: "admin"`.

### Agent identity and revocation

Human and agent tokens have distinct purposes and middleware. Agent scopes must
be an exact subset of the live registry grant. M2M sessions are stored under
`agent-sessions:<agentId>`, and removing a grant, revoking one session, or
revoking the whole agent invalidates its tokens. Delegated tokens record the
human and agent actor chain and become invalid when the originating human
session is revoked.

## Threats Not Fully Addressed

### XSS in your frontend

If frontend JavaScript is compromised, tokens stored in memory or browser storage can be stolen. Use a strong frontend CSP, avoid unsafe HTML rendering, and choose token storage deliberately.

### CSRF for cookie-based auth

Generated examples use bearer tokens. If you move tokens into cookies, add CSRF protection and strict cookie settings.

### Weak or leaked secrets

Authenik8 cannot protect tokens if the private signing JWK or `REFRESH_SECRET` is committed, logged, reused, or leaked. Public keys from `/.well-known/jwks.json` are safe to distribute.

### Public Redis exposure

Redis must not be reachable from the public internet. Use private networking, authentication, TLS where available, and provider-level access controls.

### Database authorization bugs

Authenik8 authenticates users and provides route middleware. Your application must still enforce object-level authorization, ownership checks, and tenant isolation.

### Password reset, email verification, MFA, and WebAuthn

These are not included unless you add them.

### OAuth provider compromise or misconfiguration

Provider dashboard settings, app approval screens, callback URLs, and provider secrets must be managed outside the generated app.

### Brute-force protection per credential

Global rate limiting is included. Add stricter per-email or per-account login throttling for high-risk apps.

### Token theft before expiry

Short-lived access tokens reduce exposure, but a stolen access token can be used until it expires or is rejected by your session policy.

### Workload authentication and offline agent verification

The SDK issues agent tokens only after trusted application code calls it; your
application must authenticate the workload using mTLS, cloud workload identity,
a signed assertion, or another suitable credential. Never expose issuance as an
unauthenticated route. Agent tokens remain bearer credentials. Public JWKS
verification cannot observe Redis revocation without a trusted introspection or
session-aware middleware boundary.

## Production Checklist

- Replace generated development secrets with long random values.
- Run Redis on private networking.
- Run Postgres or your database on private networking.
- Use HTTPS only.
- Set exact OAuth callback URLs in Google/GitHub dashboards.
- Use `npx prisma migrate deploy` in production.
- Review CORS policy before connecting a frontend.
- Add business-level authorization checks to every protected resource route.
- Add logging and alerting for refresh failures, OAuth failures, and admin actions.
- Keep `AUTHENIK8_AGENTS={}` unless agent identity is intentionally configured; review every agent grant and delegation policy.
- Keep `authenik8-core` and generated dependencies updated.

## Security Reporting

If you find a vulnerability in the generated app or Authenik8-core integration, do not publish exploit details publicly first. Open a private security report or contact the maintainer through the repository security policy.
