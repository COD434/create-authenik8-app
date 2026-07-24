# Threat model

Generated applications include a `THREAT_MODEL.md` file. It explains:

- What the generated application protects
- What `authenik8-core` handles with Redis-backed token state
- Which threats remain the application's responsibility
- What must be configured before production

## Key protections

- Refresh-token replay detection
- Concurrent refresh locking
- OAuth state validation
- Verified-email OAuth token issuance
- Redis-backed rate limiting
- Secure HTTP headers
- Human and agent session tracking
- Scoped agent middleware
- Delegated actor chains
- Session and agent revocation

## Key non-goals

- Frontend XSS protection
- CSRF protection for cookie-based auth
- Object-level authorization
- MFA and WebAuthn
- Password reset policy
- Provider dashboard security
- Protection from leaked deployment secrets

Before production, replace generated secrets, keep Redis private, use HTTPS, review CORS, configure exact OAuth callback URLs, and add business-level authorization checks to application routes.

[Back to the documentation index](../README.md#documentation)
