---
name: Security Review
description: Threat-model and review a web application for authn, session, authz, input, crypto, secrets, CSRF, SSRF, XSS, and logging risks
---

# Security Review

Use before shipping an auth flow, an admin surface, a data export, an integration,
or any change that crosses a trust boundary. Read
`../../canon/rules/50-security.md`.

## Workflow

1. **Name the assets.** Credentials, sessions, personal data, money, admin
   actions, audit logs, and anything an attacker can monetize.
2. **Draw the trust boundaries.** Browser to server, server to database, server
   to third party, tenant to tenant, user to admin, build to runtime.
3. **Name the actors.** Anonymous, signed-in user, tenant admin, platform admin,
   compromised dependency, malicious input.
4. **Walk the paths.** For each asset, ask who can read, change, delete, or
   exhaust it. Follow one untrusted input to its sink. Follow one request to its
   authorization check.
5. **Check the controls.** Use the checklist below. Verify in code, not in the
   README.
6. **Report and fix.** Order by exploitability and impact. Give the smallest safe
   fix and a regression test.

## Threat model template

```text
Asset:
Actor:
Entry point:
Trust boundary:
Abuse case:
Current control:
Gap:
Mitigation:
Test:
```

## Checklist

### Authentication and sessions

- Passwords hashed with Argon2id, scrypt, or bcrypt; per-user salt; calibrated
  work factor.
- Session state is server-side; the cookie is HttpOnly, Secure, SameSite.
- Session rotates on sign-in and privilege change; sign-out revokes it.
- Login, recovery, and OTP endpoints are rate-limited with backoff.
- No account enumeration in error messages or timing.

### Authorization

- Every object and action is checked server-side.
- Tenant and owner checks are part of the query or policy, not a UI guard.
- Admin actions require an explicit role check at execution time.
- Queued or delegated work re-checks authorization.
- IDs are not treated as secrets.

### Input and output

- Every external input is parsed and bounded.
- SQL uses bound parameters; identifiers use an allowlist.
- Output is encoded for its context; raw HTML is sanitized.
- File uploads have size, type, and name limits; stored outside the web root.
- Redirects and outbound URLs use an allowlist; private IPs are blocked.

### Crypto and secrets

- No homemade crypto; standard libraries and constructions.
- JWTs verify signature, algorithm allowlist, issuer, audience, expiry, and
  not-before.
- Secrets are server-side, rotated, and absent from logs, URLs, and bundles.
- Random values use a cryptographically secure source.

### Operations

- Security events are logged with a correlation ID and no secrets.
- Errors returned to clients are safe; details stay in server logs.
- Dependencies are pinned, reviewed, and scanned.
- Backups are encrypted and restores are tested.

## Finding format

```text
[critical] A8-SEC-04 src/config.ts:12
  evidence: the Stripe secret key is a string literal in a client-imported module
  impact: anyone who loads the bundle can charge or read the account
  fix: revoke the key, move it to a server-only env var, and rotate the client key
```

## Output contract

1. **Threat model:** assets, actors, boundaries.
2. **Findings:** severity order with rule IDs and evidence.
3. **Verified controls:** what you checked and found sound.
4. **Residual risk:** what needs a runtime test or an external review.

## Stop conditions

- A secret is exposed: stop, report it, and recommend revocation before any other
  work.
- Authorization depends on a client-controlled value: treat it as a critical
  finding.
- The only fix is to disable CSRF, TLS verification, or an origin check: refuse
  and propose a safe alternative.
