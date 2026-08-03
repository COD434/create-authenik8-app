# Using authenik8-core

Generated projects use `authenik8-core` v2.0.6, a JOSE and JWK human and agent identity engine.

## Create the auth object

```ts
const auth = await createAuthenik8({
  jwt: authJwkConfig(),
  refreshSecret: requiredSecret("REFRESH_SECRET"),
  redis: await createRedisClient(),
  agent: agentIdentityConfig(),
  oauth: {
    google: {
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      redirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
    },
    github: {
      clientId: requiredEnv("GITHUB_CLIENT_ID"),
      clientSecret: requiredEnv("GITHUB_CLIENT_SECRET"),
      redirectUri: requiredEnv("GITHUB_REDIRECT_URI"),
    },
  },
  identityAdapter,
});
```

Every generated server injects its selected Redis client. OAuth presets also
inject an application-owned Prisma identity adapter; callback code consumes the
core result instead of running a competing identity lookup or linking policy.

The factory returns one auth object for the generated routes:

- `signToken(payload)` creates access tokens.
- `verifyToken(token)` verifies access-token signatures and claims.
- `verifyActiveToken(token)` also checks Redis-backed revocation and quarantine state.
- `requireAuth` verifies the token and rejects Redis-revoked sessions.
- `getJwks()` returns only public verification keys for the generated JWKS endpoint.
- `generateRefreshToken(payload)` creates stateful refresh tokens.
- `refreshToken(refreshToken)` rotates refresh tokens and returns a new access and refresh pair.
- `helmet`, `rateLimit`, and `ipWhitelist` are Express middleware.
- `requireAdmin` protects administrator-only routes by checking `role: "admin"`.
- `requireRole`, `requirePermission`, `requireScope`, and `requireTenant` compose application authorization policies.
- `oauth.google` and `oauth.github` provide redirect and callback handlers.
- `issueTokens(payload)` creates an access and refresh pair with one shared session ID.
- `agent.issueToken(...)` creates a scoped, Redis-session-backed machine identity after the application authenticates the workload.
- `agent.issueDelegatedToken(...)` creates an agent token bound to an active human session and explicit delegation policy.
- `agent.requireScopes(...)`, `agent.revokeSession(...)`, and `agent.revokeAgent(...)` enforce machine authorization and revocation.
- `audit` emits versioned security events to application-owned sinks, while `risk` exposes session quarantine state.

## Agent identity mapping

Generated projects keep agent identity disabled with `AUTHENIK8_AGENTS={}`. Adding a validated agent-to-scope mapping enables the optional core API. Every project also receives `AGENT_IDENTITY.md` with a database-registry example, trusted workload exchange, scoped route, delegated-user flow, and revocation.

The CLI intentionally does not scaffold a public token-minting endpoint. It cannot safely infer whether a workload uses mTLS, a cloud workload identity, or a signed client assertion. Applications must authenticate that workload before calling the privileged `agent.issueToken()` primitive.

## Redis-backed token lifecycle

Authenik8-core intentionally makes JWT auth stateful:

1. Access tokens are signed with the active ES256 JWK and carry its `kid`, issuer, audience, and token purpose.
2. Refresh tokens are signed with `REFRESH_SECRET` and include a unique `jti`.
3. Core stores a fingerprint of the current refresh token and indexes each refresh family for complete user-wide revocation.
4. Refresh calls acquire a namespaced Redis lock scoped to the user and session.
5. The submitted refresh token must match the Redis value.
6. A new access token and refresh token are issued.
7. The new refresh token atomically replaces the old one.
8. Reusing the old refresh token fails.

Redis provides refresh-token replay protection, concurrent refresh protection, server-side session control, and quarantine state. Core owns its Redis key layout; set `redisKeyPrefix` only when a deployment needs an explicit stable namespace.

For generated projects, use `ops rotate signing-key` instead of editing the
ring manually. The two-phase runbook creates keys with the installed engine,
deploys the staged ring before activation, and retains old public JWKs until
all tokens signed by them have expired. `/.well-known/jwks.json` publishes
every verification key without private fields.

## OAuth identity resolution

Provider callbacks are normalized into this profile shape:

```ts
{
  email: "user@example.com",
  name: "User Name",
  provider: "google",
  providerId: "provider-user-id",
  email_verified: true
}
```

The Identity Engine then chooses one of these outcomes:

- **Existing provider login:** The provider is already linked, so tokens are issued.
- **New user creation:** No matching identity exists, so a new user identity is created.
- **Link required:** An email match exists but policy requires explicit account linking.
- **Link provider:** An authenticated user links Google or GitHub to an existing account.

OAuth state is stored for five minutes and consumed atomically before the provider token exchange. Application-owned identity adapters implement the public `OAuthIdentityAdapter` contract, including `findUserById()` and explicit `createUser()` outcomes for creation races. Core owns the default Redis adapter's key layout.

## Security middleware

Generated applications use the middleware returned by core:

```ts
app.use(auth.helmet);
app.use(auth.rateLimit);
```

`helmet` applies enforcing secure HTTP headers. `rateLimit` is Redis-backed and defaults to 100 requests per 60 seconds with a 300-second block. `ipWhitelist` is available for stricter APIs and requires every allowed address, including loopback, to be added explicitly.

Forwarding headers are ignored unless `trustedProxyCidrs` identifies the proxy networks allowed to set them. A blanket `trustProxyHeaders: true` setting is rejected.

## Common errors

- `MissingTokenError`: No refresh token was sent.
- `InvalidTokenError`: The refresh token is invalid, expired, reused, or replaced.
- `Concurrent refresh detected`: Two refresh requests tried to rotate the same token at once.
- `OAuthError:Invalid or expired state`: OAuth callback state is missing from Redis.
- `OAuth profile email must be verified before issuing tokens`: The provider email was not verified.
- `Provider already linked to another user`: Account linking tried to attach an already owned provider.

[Back to the documentation index](../README.md#documentation)
