# Using authenik8-core

Generated projects use `authenik8-core` v2.0.3, a JOSE and JWK human and agent identity engine.

## Create the auth object

```ts
const auth = await createAuthenik8({
  jwt: authJwkConfig(),
  refreshSecret: requiredSecret("REFRESH_SECRET"),
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
});
```

The factory returns one auth object for the generated routes:

- `signToken(payload)` creates access tokens.
- `verifyToken(token)` verifies access tokens.
- `requireAuth` verifies the token and rejects Redis-revoked sessions.
- `getJwks()` returns only public verification keys for the generated JWKS endpoint.
- `generateRefreshToken(payload)` creates stateful refresh tokens.
- `refreshToken(refreshToken)` rotates refresh tokens and returns a new access and refresh pair.
- `helmet`, `rateLimit`, and `ipWhitelist` are Express middleware.
- `requireAdmin` protects administrator-only routes by checking `role: "admin"`.
- `oauth.google` and `oauth.github` provide redirect and callback handlers.
- `issueTokens(payload)` creates an access and refresh pair with one shared session ID.
- `agent.issueToken(...)` creates a scoped, Redis-session-backed machine identity after the application authenticates the workload.
- `agent.issueDelegatedToken(...)` creates an agent token bound to an active human session and explicit delegation policy.
- `agent.requireScopes(...)`, `agent.revokeSession(...)`, and `agent.revokeAgent(...)` enforce machine authorization and revocation.

## Agent identity mapping

Generated projects keep agent identity disabled with `AUTHENIK8_AGENTS={}`. Adding a validated agent-to-scope mapping enables the optional core API. Every project also receives `AGENT_IDENTITY.md` with a database-registry example, trusted workload exchange, scoped route, delegated-user flow, and revocation.

The CLI intentionally does not scaffold a public token-minting endpoint. It cannot safely infer whether a workload uses mTLS, a cloud workload identity, or a signed client assertion. Applications must authenticate that workload before calling the privileged `agent.issueToken()` primitive.

## Redis-backed token lifecycle

Authenik8-core intentionally makes JWT auth stateful:

1. Access tokens are signed with the active ES256 JWK and carry its `kid`, issuer, audience, and token purpose.
2. Refresh tokens are signed with `REFRESH_SECRET` and include a unique `jti`.
3. Each session's current refresh token is stored under `refresh:<userId>:<sessionId>` and indexed for complete user-wide revocation.
4. Refresh calls acquire a Redis lock with `lock:<userId>:<sessionId>`.
5. The submitted refresh token must match the Redis value.
6. A new access token and refresh token are issued.
7. The new refresh token atomically replaces the old one.
8. Reusing the old refresh token fails.

Redis provides refresh-token replay protection, concurrent refresh protection, and server-side session control.

To rotate keys, append a new private JWK to `AUTHENIK8_SIGNING_JWKS`, set `AUTHENIK8_ACTIVE_KID` to its `kid`, and retain old public JWKs until all tokens signed by them have expired. `/.well-known/jwks.json` publishes every verification key without private fields.

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

OAuth state is stored in Redis for five minutes under `oauth:state:<state>`. Redis-backed identity records use:

```text
oauth:v1:user:<userId>
oauth:v1:email:<email>
oauth:v1:provider:<provider>:<providerId>
```

## Security middleware

Generated applications use the middleware returned by core:

```ts
app.use(auth.helmet);
app.use(auth.rateLimit);
```

`helmet` applies secure HTTP headers. `rateLimit` is Redis-backed and defaults to 100 requests per 60 seconds with a 300-second block. `ipWhitelist` is available for stricter APIs and allows localhost by default.

## Common errors

- `MissingTokenError`: No refresh token was sent.
- `InvalidTokenError`: The refresh token is invalid, expired, reused, or replaced.
- `Concurrent refresh detected`: Two refresh requests tried to rotate the same token at once.
- `OAuthError:Invalid or expired state`: OAuth callback state is missing from Redis.
- `OAuth profile email must be verified before issuing tokens`: The provider email was not verified.
- `Provider already linked to another user`: Account linking tried to attach an already owned provider.

[Back to the documentation index](../README.md#documentation)
