
<div align="center">

![logo](https://raw.githubusercontent.com/COD434/authenik8-core-Beta-/main/assets/logo.svg)

<h1>create-authenik8-app</h1>

<p><strong>Generate a secure Express API or a connected React + Express application from one CLI.</strong></p>

<p>Authenik8 provides production-minded identity flows, stateful JWT rotation, Redis-backed sessions, Prisma, OAuth, and a complete fullstack application preset.</p>

</div>

![NPM Downloads](https://img.shields.io/npm/dw/create-authenik8-app)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/COD434/create-authenik8-app/badge)](https://securityscorecards.dev/viewer/?uri=github.com/COD434/create-authenik8-app)
![CI](https://github.com/COD434/create-authenik8-app/actions/workflows/ci.yml/badge.svg)
[![Coverage](https://img.shields.io/badge/coverage-80%25-green)](https://github.com/COD434/create-authenik8-app/actions/workflows/ci.yml)

**See a real generated example → [create-authenik8-app-example](https://github.com/COD434/create-authenik8-app-example)**


---

## Quickstart

Create a new project:

```bash
npx create-authenik8-app my-app
```

Choose the installer for an Express preset when needed:

```bash
npx create-authenik8-app my-api --package-manager pnpm
```

The CLI uses the invoking package manager when it can identify one, otherwise it defaults to npm. Install commands use the local package cache first and suppress registry audit/funding requests during scaffolding. Set `AUTHENIK8_VERBOSE=1` to show complete installer output.

Choose **Full-stack application** for the complete App Kit, or select one of the three Express API presets.

### Full-stack application

Requirements: Node.js 20.19+, 22.12+, or 24+, npm, and Docker with Compose.

```bash
cd my-app
npm run docker:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to Express on `http://localhost:3000`.

### Express API

Requirements: Node.js 20.19+, 22.12+, or 24+.

```bash
cd my-app
npm run docker:up
npm run prisma:migrate # Skip only when JWT-only was generated without Prisma
npm run dev
```

---

## Presets

| Preset | Best for | Included |
| --- | --- | --- |
| **Express API (JWT only)** | APIs that manage identities elsewhere | Protected routes, rotating refresh tokens, RBAC, optional Prisma |
| **Express API + email/password** | First-party accounts | Registration, login, password hashing, Prisma |
| **Express API + OAuth** | Multiple sign-in methods | Password auth, Google and/or GitHub OAuth, account linking |
| **Full-stack application** | Starting a complete product | React/Vite, Express, shared contracts, typed client, PostgreSQL, Redis, account/admin UI, Project CRUD |

## Full-stack App Kit

The fullstack preset is an npm workspace with connected frontend, backend, and shared packages:

```text
apps/
  api/                 Express, Authenik8, Prisma, PostgreSQL, Redis
  web/                 React, Vite, React Router, TanStack Query
packages/
  contracts/           Shared Zod request schemas and response types
  api-client/          Typed browser client and refresh handling
  ui/                  Reusable application primitives
```

It includes:

- Registration, login, logout, OAuth, password recovery, and email verification
- Profile, password, linked-provider, session, and session-revocation screens
- Admin users, roles, status controls, session revocation, and audit events
- An owned Project resource across database, API, policy, client, and UI layers
- OpenAPI 3.1 output, health checks, structured logs, request IDs, and security middleware
- Docker Compose for PostgreSQL and Redis, Prisma migrations, seed data, tests, and production docs

Access tokens remain in browser memory. Refresh tokens use a restricted HttpOnly cookie, and server-side policies remain the authorization boundary.

### Full-stack commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build shared packages and watch the API, web app, contracts, client, and UI |
| `npm run build` | Build all production bundles |
| `npm start` | Start Express and serve the built SPA and `/api` |
| `npm run db:migrate` | Apply the Prisma development migration |
| `npm run db:seed` | Create the configured administrator and example data |
| `npm test` | Run API policy/security tests and web storage tests |
| `npm run typecheck` | Type-check every workspace |

---

## Core authentication features

• JWT authentication (access + refresh tokens) with secure rotation

• Redis-based token storage

• Role-Based Access Control (RBAC)

• TypeScript setup

• Express server preconfigured with security middleware

• Clean scalable folder structure

• .env file generated automatically

• Generated threat model and production guidance


---

## Why create-authenik8-app

Most developers waste days (or weeks) on:

• Manual JWT setup

• Secure refresh token handling

• Redis session configuration

• Proper access control 

Authenik8 provides these foundations so you can start with a secure API or a connected application instead of rebuilding identity infrastructure.


---

## Requirements

• Node.js 20.19+, 22.12+, or 24+ for every preset

• Docker with Compose for the generated PostgreSQL and Redis services

• Redis is required for refresh-token rotation, OAuth state, rate limits, and session controls

### CLI compatibility

The CLI is tested on Linux, Windows, and macOS. Express presets support npm, pnpm, and Bun dependency installation; the fullstack preset uses npm workspaces. Prisma-backed pnpm and Bun projects include explicit approvals for the native dependency build steps they require.

| Option | Purpose |
| --- | --- |
| `--package-manager npm\|pnpm\|bun` | Select the installer for an Express preset |
| `--no-install` | Generate files without installing dependencies |
| `--resume` | Continue an interrupted generation |
| `--production-ready` | Add PM2 configuration to an Express preset |
| `--version` | Print the installed CLI version |

Git initialization is skipped with a clear status when Git is unavailable. Installer failures retain the package manager's diagnostic output, while successful interactive runs keep the progress display concise.

---

## Environment Variables

The CLI creates a git-ignored `.env` with a unique ES256 signing key and refresh secret. Move those values into your deployment secret manager; never commit the private JWK.

### Express API presets

```dotenv
DATABASE_URL=file:./dev.db
AUTHENIK8_SIGNING_JWKS='[{"kty":"EC","crv":"P-256","kid":"<key-id>","x":"...","y":"...","d":"...","alg":"ES256"}]'
AUTHENIK8_ACTIVE_KID=<key-id>
AUTHENIK8_ISSUER=http://localhost:3000
AUTHENIK8_AUDIENCE=my-app-api
REFRESH_SECRET=<generated-random-secret>
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

For password + OAuth, also configure the enabled providers:

```dotenv
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback
```

### Full-stack preset

```dotenv
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/authenik8?schema=public
REDIS_URL=redis://localhost:6379
AUTHENIK8_SIGNING_JWKS='[{"kty":"EC","crv":"P-256","kid":"<key-id>","x":"...","y":"...","d":"...","alg":"ES256"}]'
AUTHENIK8_ACTIVE_KID=<key-id>
AUTHENIK8_ISSUER=http://localhost:3000
AUTHENIK8_AUDIENCE=my-app-api
REFRESH_SECRET=<generated-random-secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/oauth/github/callback
```

OAuth variables are generated only for selected providers. The fullstack `.env.example` also documents cookie, proxy, logging, mail delivery, and seed-admin settings.

---


## RBAC Example

Example of a protected route:
```
app.get("/admin", auth.requireAdmin, (req, res) => {
  res.json({ message: "Admin only route" });
});
```

---

### Testing

- Full test suite with ``80%`` coverage (actively improving)

- CI runs tests + coverage on every push and PR

---

## How It Works (Key Concept)

Authenik8 is not just another auth library.
It is an auth system generator.
At its core is the Identity Engine ``(authenik8-core)`` that treats authentication as an

# identity resolution problem:

• Unifies credentials (email/password) + OAuth providers

• Prevents duplicate identities

• Handles account linking intelligently

• Normalizes data across providers

This design makes future additions (MFA, WebAuthn, etc.) much cleaner.

---
## Powered by

authenik8-core (v2.0.3)  JOSE/JWK human + agent identity engine (beta)

---

## How authenik8-core works in generated apps

Generated projects call:

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

That factory returns one auth object used by the generated routes:

• `signToken(payload)` creates access tokens.

• `verifyToken(token)` verifies access tokens.

• `requireAuth` verifies the token and rejects Redis-revoked sessions.

• `getJwks()` returns only public verification keys for the generated JWKS endpoint.

• `generateRefreshToken(payload)` creates stateful refresh tokens.

• `refreshToken(refreshToken)` rotates refresh tokens and returns a new access/refresh pair.

• `helmet`, `rateLimit`, and `ipWhitelist` are Express middleware.

• `requireAdmin` protects admin-only routes by checking `role: "admin"`.

• `oauth.google` and `oauth.github` provide redirect and callback handlers.

• `issueTokens(payload)` creates an access/refresh pair with one shared session ID.

• `agent.issueToken(...)` creates a scoped, Redis-session-backed M2M identity after your application authenticates the workload.

• `agent.issueDelegatedToken(...)` creates an agent token bound to an active human session and explicit delegation policy.

• `agent.requireScopes(...)`, `agent.revokeSession(...)`, and `agent.revokeAgent(...)` enforce machine authorization and revocation.

### Agent identity mapping

Generated projects keep agent identity disabled with `AUTHENIK8_AGENTS={}`.
Adding a validated agent-to-scope mapping enables the optional core API. Every
project also receives `AGENT_IDENTITY.md` with a database-registry example,
trusted workload exchange, scoped route, delegated-user flow, and revocation.

The CLI intentionally does not scaffold a public token-minting endpoint. It
cannot safely infer whether your workload uses mTLS, a cloud workload identity,
or a signed client assertion. Applications must authenticate that workload
before calling the privileged `agent.issueToken()` primitive.

### Redis-backed token lifecycle

Authenik8-core intentionally makes JWT auth stateful:

1. Access tokens are signed with the active ES256 JWK and carry its `kid`, issuer, audience, and token purpose.
2. Refresh tokens are signed with `REFRESH_SECRET` and include a unique `jti`.
3. Each session's current refresh token is stored under `refresh:<userId>:<sessionId>` and indexed for complete user-wide revocation.
4. Refresh calls acquire a Redis lock with `lock:<userId>:<sessionId>`.
5. The submitted refresh token must match the Redis value.
6. A new access token and refresh token are issued.
7. The new refresh token atomically replaces the old one.
8. Reusing the old refresh token fails.

This is why Redis is required. It enables refresh-token replay protection, concurrent refresh protection, and server-side session control.

To rotate keys, append a new private JWK to `AUTHENIK8_SIGNING_JWKS`, set `AUTHENIK8_ACTIVE_KID` to its `kid`, and retain old public JWKs until all tokens signed by them have expired. `/.well-known/jwks.json` publishes every verification key without private fields.

### OAuth identity resolution

OAuth is not handled as separate unrelated Passport-style strategies. Provider callbacks are normalized into this profile shape:

```ts
{
  email: "user@example.com",
  name: "User Name",
  provider: "google",
  providerId: "provider-user-id",
  email_verified: true
}
```

The Identity Engine then decides:

• Existing provider login: provider is already linked, so tokens are issued.

• New user creation: no matching identity exists, so a new user identity is created.

• Link required: an email match exists but policy requires explicit account linking.

• Link provider: an authenticated user links Google or GitHub to their existing account.

OAuth state is stored in Redis for five minutes under `oauth:state:<state>`, and Redis-backed identity records use:

```text
oauth:v1:user:<userId>
oauth:v1:email:<email>
oauth:v1:provider:<provider>:<providerId>
```

### Security middleware

Generated apps use the middleware returned by core:

```ts
app.use(auth.helmet);
app.use(auth.rateLimit);
```

`helmet` applies secure HTTP headers. `rateLimit` is Redis-backed and defaults to 100 requests per 60 seconds with a 300-second block. `ipWhitelist` is available for stricter APIs and allows localhost by default.

### Common core errors

• `MissingTokenError`: no refresh token was sent.

• `InvalidTokenError`: refresh token is invalid, expired, reused, or replaced.

• `Concurrent refresh detected`: two refresh requests tried to rotate the same token at once.

• `OAuthError:Invalid or expired state`: OAuth callback state is missing from Redis.

• `OAuth profile email must be verified before issuing tokens`: provider email was not verified.

• `Provider already linked to another user`: account linking tried to attach an already-owned provider.

---

## Threat Model

Generated apps include a `THREAT_MODEL.md` file. It explains:

• what the generated app protects,

• what `authenik8-core` handles with Redis-backed token state,

• what threats remain your responsibility,

• and what must be configured before production.

Key protections include refresh-token replay detection, concurrent refresh locking, OAuth state validation, verified-email OAuth token issuance, Redis-backed rate limiting, secure headers, human and agent session tracking, scoped agent middleware, delegated actor chains, and revocation.

Key non-goals include frontend XSS protection, CSRF for cookie-based auth, object-level authorization, MFA/WebAuthn, password reset, provider dashboard security, and protection from leaked secrets.

Before production, replace generated secrets, keep Redis private, use HTTPS, review CORS, configure exact OAuth callback URLs, and add business-level authorization checks to your own routes.

---

## Production Enhancements

• PM2 cluster mode + auto-restart

• Memory usage guardrails

• Security middleware (Helmet, rate limiting, etc.)

---

## The Identity Engine

At the heart of Authenik8 is the **Identity Engine** , a unified authentication core built into `authenik8-core`.

---

### Why a dedicated Identity Engine?

Traditional auth systems treat login as separate, isolated flows:

• Email/password goes one way

• Google OAuth another way

• GitHub yet another

This leads to duplicate accounts, inconsistent data, fragile linking logic, and security gaps.

The **Identity Engine** solves this by treating authentication as an **identity resolution problem** instead of just credential validation.

---

### What the Identity Engine does

• **Unified Identity Resolution**  
  It intelligently resolves any login method (credentials, OAuth, or future strategies) into a single, consistent user identity in your system.

• **Smart Account Linking**  
  Automatically detects when a user already exists (via email or other signals) and offers secure linking instead of creating duplicates.

• **Profile Normalization**  
  Converts provider-specific data (Google profile, GitHub profile, etc.) into your app’s clean, unified user schema.

• **Secure Token Lifecycle Management**  
  Handles JWT access + refresh tokens with rotation, JTI-based replay protection, and Redis-backed stateful control.

- **Consistent Security Layer**  
  Applies the same high-security rules (rate limiting, IP awareness, session controls) across all authentication methods.

---

### OAuth Through the Identity Engine

OAuth (Google, GitHub, and more coming) is **not** implemented as direct Passport.js-style routes. Instead:

1. The provider callback is received

2. The Identity Engine resolves/normalizes the profile

3. It decides: login existing user, link to existing account, or create new identity

4. Returns consistent tokens and user data

This design makes adding new providers or authentication methods much cleaner and more secure.

---

## Authenik8 vs Passport.js

| Aspect                    | **Authenik8**                                      | **Passport.js**                          |
|---------------------------|----------------------------------------------------|------------------------------------------|
| **Purpose**               | Full auth system generator                         | Authentication middleware                |
| **Setup Time**            | \~30 seconds (complete project)                     | Hours to days                            |
| **JWT + Refresh Tokens**  | Secure rotation + replay protection built-in       | Manual implementation required           |
| **OAuth**                 | Unified via Identity Engine (smart linking)       | Separate strategies per provider         |
| **RBAC**                  | Built-in middleware                                | Not included                             |
| **Production Features**   | PM2, Helmet, rate limiting, memory guards          | None (you add them)                      |
| **Identity Management**   | Centralized Identity Engine                        | None                                     |
| **Flexibility**           | Medium (opinionated & extensible)                  | Very high                                |
| **Best For**              | Fast, secure, consistent backends                  | Maximum customization                    |


Passport.js is a great flexible tool, but it leaves you to build secure JWT, refresh logic, OAuth linking, and RBAC yourself.
Authenik8 gives you a complete, production-ready authentication system from day one.


---

### Benefits for you

• No more duplicate user headaches

• Consistent security behavior across all login methods

• Easier future-proofing (MFA, WebAuthn, enterprise SSO, etc.)

• Cleaner, more maintainable codebase in your generated project

The Identity Engine is what makes Authenik8 feel like a coherent **authentication system** rather than a collection of routes and middleware.

---

## Notes

• This generates a starter project, not a full framework

• Redis is mandatory for security features

• authenik8-core is closed-source for security reasons (implementation details)



---

## Roadmap

• Advanced RBAC (custom roles/permissions)

• webAuthn

• MFA

• Production presets
