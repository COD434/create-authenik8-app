# Authenik8-core

JWT rotation without uniqueness is fake security — Authenik8 fixes that.
Authenik8 is a modular authentication and security SDK for Node.js.
It combines:

 JWT authentication
 Secure refresh token rotation
 Redis-backed session control
 Built-in security middleware

***

## Getting started
```
import { createAuthenik8 } from "authenik8";

const auth = await createAuthenik8({
  jwtSecret: "ACCESS_SECRET",
  refreshSecret: "REFRESH_SECRET"
});

// generate tokens
const refreshToken = await auth.generateRefreshToken({
  userId: "user_1",
  email: "test@test.com"
});

// refresh tokens
const result = await auth.refresh(refreshToken);
```
***

## Why Authenik8-core?


JWT makes authentication look simple…
…but introduces hidden problems:

 Refresh token reuse (replay attacks)
 Stateless logout issues
 Broken token rotation
 Scattered security logic

Authenik8 solves this with:

 Refresh token rotation (with uniqueness via jti)
 Stateful session control (Redis)
 Built-in security (rate limit, IP whitelist, helmet)
 Clean, unified API

 ***
## Secure Refresh Flow
```
 // first use → valid
await auth.refresh(token);

// reuse same token → rejected
await auth.refresh(token); // ❌ throws
```
***

## API Overview
```
const auth = await createAuthenik8(config);

// auth
auth.signToken(payload);
auth.verifyToken(token);

// refresh
auth.refresh(refreshToken);
auth.generateRefreshToken(payload);

// security
auth.rateLimit;
auth.ipWhitelist;
auth.helmet;

// middleware
auth.requireAdmin;
```
***
## Architecture

```
┌───────────────┐
                │    Client     │
                │ (Web / Mobile)│
                └───────┬───────┘
                        │
                        ▼
            ┌─────────────────────┐
            │   API / Backend     │
            └─────────┬───────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │   Authenik8-core    │
            │─────────────────────│
            │  JWT Service        │
            │  - Sign / Verify    │
            │                     │
            │  Refresh Service    │
            │  - Rotation         │
            │  - Replay Detection │
            │                     │
            │  Security Module    │
            │  - Rate Limiting    │
            │  - IP Controls      │
            │  - Middleware       │
            └─────────┬───────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │       Redis         │
            │─────────────────────│
            │  Session Store      │
            │  Token State        │
            │  Revocation Data    │
            └─────────────────────┘

```
***

## Important

Authenik8-core uses stateful JWT authentication.
This means:
Requires Redis (or compatible store)
Provides stronger security and control than stateless JWT

## Add your files

```
cd existing_repo
git remote add origin https://gitlab.com/COD434/authenik8-core.git
git branch -M main
git push -uf origin main
```

***
## Built with Real Testing

Authenik8-core includes integration-tested flows for:

Token rotation
Replay attack prevention
Secure refresh logic

***
### Threats Addressed

- Refresh token replay attacks
- Concurrent token refresh abuse
- Stateless session vulnerabilities
- Basic rate limit bypass (IP rotation)

***
## How It Works Internally
Authenik8-core is designed around stateful JWT authentication to address real-world attack scenarios.
## Refresh Token Rotation

Each refresh token includes a unique identifier (jti).
Flow:

Token is issued with a jti

jti is stored in Redis
On refresh:

Token is validated
jti is checked against Redis

If valid:

Old token is invalidated
New token is issued with a new jti

## Replay Attack Detection

If a refresh token is reused:

The jti no longer exists or is marked as used
The request is rejected immediately
This prevents:

Token replay attacks
Concurrent refresh abuse

## Stateful Session Control
Unlike traditional JWT systems:
Sessions are tracked in Redis
Tokens can be revoked
Logout is fully enforced

## Security Layer
Authenik8-core includes built-in middleware for:
Rate limiting
IP-based controls
Secure headers (Helmet)
These operate alongside authentication to provide: 👉 a unified security layer

## Why Stateful Matters
Stateless JWT:
Cannot revoke tokens easily
Cannot detect reuse
Cannot track behavior
Authenik8-core:
Tracks token lifecycle
Detects anomalies
Enables real control over sessions
***


## Use Cases

SaaS backends
APIs with authentication
Secure admin systems
Systems requiring session control

***

## Final Thought

JWT alone is not an authentication system.
Authenik8-core makes it one.
***
