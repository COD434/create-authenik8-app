# Project diagnostics

Doctor is a focused, versioned diagnostic tool. It does not claim that the
whole application is secure.

Run it from a generated project:

```bash
npx create-authenik8-app@latest doctor
```

The default mode is read-only. It detects the project, validates generated
structure and `authenik8.json`, checks runtime and package-manager
compatibility, validates environment and signing-key semantics, inspects
Prisma configuration, and verifies the selected Redis mode.

## Deep and production checks

Deep mode uses a unique `authenik8:doctor:<uuid>` namespace. It checks Redis
round trips, expiry, deletion, conditional locking, and atomic consumption,
then exercises the installed core's token issuance, verification, refresh
rotation, replay rejection, concurrent refresh handling, session revocation,
invalid-signature rejection, and public JWKS output:

```bash
npx create-authenik8-app@latest doctor --deep
```

Production mode includes deep checks and rejects development assumptions such
as in-process or loopback services, non-HTTPS origins, insecure fullstack
cookies, and embedded PostgreSQL:

```bash
npx create-authenik8-app@latest doctor --production
```

Doctor never applies development migrations or rotates signing keys.

## Stable diagnostics

Every diagnostic has a stable `A8-<CATEGORY>-<NUMBER>` ID. Run one diagnostic
and its prerequisites:

```bash
npx create-authenik8-app@latest doctor --check A8-DB-003
```

Explain a diagnostic without loading a project:

```bash
npx create-authenik8-app@latest doctor --explain A8-JWK-006
```

## Safe fixes

Preview safe fixes without writing:

```bash
npx create-authenik8-app@latest doctor --fix --dry-run
```

Apply eligible fixes and rerun their diagnostics:

```bash
npx create-authenik8-app@latest doctor --fix
```

Automatic fixes are intentionally narrow. Doctor can add `.env` to
`.gitignore` when the file is not tracked and restrict `.env` to mode `0600`.
Other findings remain manual. It captures original content or modes, uses
atomic writes, verifies the result, and restores captured state if
verification fails.

## CI, offline configuration, and reports

Use deterministic colour-free output and fail on warnings:

```bash
npx create-authenik8-app@latest doctor --ci --production --strict
```

In a clean checkout without `.env`, use:

```bash
npx create-authenik8-app@latest doctor --ci --offline --strict
```

Offline mode validates `.env.example` and keeps its ephemeral ES256 key,
refresh secret, and enabled-provider credentials only in memory. It never
writes them to disk. Explicit environment pairs are validated together and an
incomplete pair fails closed.

Write a private, sanitized support report:

```bash
npx create-authenik8-app@latest doctor --report
```

Reports use schema version 1, are written under
`.authenik8/reports/doctor-<timestamp>.json`, and receive mode `0600` on POSIX
systems. Doctor reports never include environment values; defense-in-depth
redaction removes credential URLs, bearer values, JWT-shaped strings, private
PEM material, and sensitive fields.

`--json` prints the same schema-versioned report to standard output.
`--skip-services` remains available for older automation, but new CI should use
`--offline`.

## Exit codes

| Exit code | Meaning |
| ---: | --- |
| `0` | Checks completed with no failures |
| `1` | A diagnostic failed, or a warning exists in strict mode |
| `2` | Invalid usage or no Authenik8 project was detected |
| `3` | Doctor encountered an internal error |
| `4` | A requested automatic fix failed and was restored |
| `5` | A safely redacted report could not be written |

The generator runs the static boundary automatically before marking a project
ready. The source-controlled `authenik8.json` contains architecture and release
metadata only—never secrets, credentials, tokens, environment values, or
timestamps.

[Back to the documentation index](../README.md#documentation)
