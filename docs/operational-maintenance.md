# Operational auth maintenance

The `ops` command owns a narrow set of repeatable authentication runbooks. It
is deliberately separate from generation and from Doctor's safe configuration
fixes.

Run it from a generated project:

```bash
npx create-authenik8-app@latest ops --help
```

All commands support schema-versioned `--json` output. Signing keys, refresh
secrets, OAuth secrets, Redis credentials, bearer values, and tokens are never
included. Mutating commands produce a plan by default and require
target-specific confirmation to apply it.

## Readiness and production audit

Readiness runs strict production Doctor checks, including the isolated Redis
and installed-core lifecycle:

```bash
npx create-authenik8-app@latest ops readiness
```

A warning makes readiness fail. No report is written.

Production audit runs the same boundary and writes a sanitized report under
`.authenik8/reports` with mode `0600` on POSIX systems:

```bash
npx create-authenik8-app@latest ops audit production
```

This audits Authenik8 configuration and runtime readiness. It is not a
penetration test, compliance certification, or replacement for deployment
monitoring.

## OAuth verification

Verify all configured providers or one provider:

```bash
npx create-authenik8-app@latest ops verify oauth
npx create-authenik8-app@latest ops verify oauth google
```

The command first requires the provider's Doctor configuration diagnostic to
pass. It then loads the generated project's installed `authenik8-core`,
initializes the provider with the configured values, and proves that a
canonical authorization redirect contains a 256-bit, one-use state value. The
state is kept in an isolated in-memory store; the command does not write OAuth
state or sessions to production Redis.

The assurance level is named `redirect-initialization`. It stops callback
handling immediately after isolated state consumption, before any provider
request. It does not contact Google or GitHub, complete a callback, or claim
that a provider accepts the client ID and secret. A real browser sign-in
remains the end-to-end credential test.

## Two-phase signing-key rotation

Production key rotation is intentionally two-phase. A one-step key switch can
break a rolling deployment: an old instance does not know the new key and can
reject tokens issued by a newly restarted instance.

The command loads the generated project's installed engine. New keys come from
`generateSigningJwk()`, and each proposed ring must pass
`createAuthenik8()`, `getJwks()`, and `verifyAccessTokenWithJwks()` before it
can be written.

First preview and stage a key:

```bash
npx create-authenik8-app@latest ops rotate signing-key
npx create-authenik8-app@latest ops rotate signing-key \
  --apply \
  --confirm-active-kid <current-kid>
```

Staging atomically adds one new private key to `.env` while leaving the current
key active. It preserves comments and unrelated environment values, restricts
the file to mode `0600`, runs post-write Doctor verification, and restores the
captured content if verification fails. The command refuses to stage a second
key while another non-active private key is already staged.

Deploy the staged key ring to every application instance. Only after that
rollout is complete, preview and activate the staged key:

```bash
npx create-authenik8-app@latest ops rotate signing-key \
  --activate-kid <staged-kid>

npx create-authenik8-app@latest ops rotate signing-key \
  --activate-kid <staged-kid> \
  --apply \
  --confirm-active-kid <current-kid>
```

Activation makes the staged key active and removes private material from every
older key while retaining their public components for verification. Deploy the
activated ring to every instance. Remove an old public key only after every
token it could have signed has expired and the operational retention policy
allows removal; key pruning is intentionally not automated.

The command refuses to add a seventeenth key. This prevents silent loss of an
old verification key and matches the installed core's bounded key-ring
contract.

## Revoke all sessions for one user

Preview the target and active-session counts:

```bash
npx create-authenik8-app@latest ops revoke user <user-id> --all-sessions
```

Apply only with the exact target repeated and an operator reason:

```bash
npx create-authenik8-app@latest ops revoke user <user-id> \
  --all-sessions \
  --apply \
  --confirm-user <user-id> \
  --reason "credential compromise"
```

Express presets write an authorized operation receipt under
`.authenik8/operations` before revoking the user's Redis-backed core sessions,
then finalize it as applied or failed. The directory is git-ignored, receives
mode `0700`, and receipts receive mode `0600` on POSIX systems. If the initial
receipt cannot be written, revocation does not begin.

The fullstack preset uses an isolated adapter for its explicit dual-authority
contract: it revokes PostgreSQL `Session` rows and writes an
`ops.sessions.revoked` `AuditEvent` with the reason in one database
transaction, then revokes the core sessions in Redis. If Redis cleanup fails
after the database transaction, the result is `partial` and exits with code
`4`; database-backed fullstack authentication has already failed closed, and
the operator is told to retry Redis cleanup.

Core-session inspection and revocation use the installed engine's public
`listSessions()` and `revokeAllSessions()` methods. The CLI never reads or
deletes engine-owned Redis keys directly.

`memory://` is rejected. Its sessions live inside the application process, so
a separate CLI process cannot truthfully inspect or revoke them. Use the
running application's administrator flow locally, or configure shared Redis
for operational maintenance.

## Exit codes

| Exit code | Meaning |
| ---: | --- |
| `0` | The read-only operation passed, a plan was produced, or the mutation applied and verified |
| `1` | Readiness, audit, or OAuth verification failed |
| `2` | Invalid usage or no generated Authenik8 project was detected |
| `3` | A runtime or operation prerequisite failed |
| `4` | A mutation failed verification, was restored, or completed only partially |
| `5` | A sanitized audit report could not be written |

[Back to the documentation index](../README.md#documentation)
