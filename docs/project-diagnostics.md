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

Fullstack deep runs also probe the configured local API port once, loopback
only: `A8-DEV-001` verifies that whatever is listening on `PORT` actually
answers an HTTP health request. A listener that accepts connections but never
responds makes every local request hang forever — the signature behind the
"page loads infinitely" defect class fixed in `create-authenik8-app` 2.5.x's
`scripts/run-local.mjs` watcher orchestration. Nothing listening on the port
skips the check, because Doctor may run while the development stack is
stopped.

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

### GitHub Actions gate

A composite action ships with this repository so generated projects can gate
pull requests on the same diagnostics:

```yaml
name: Authenik8 Doctor
on: [pull_request]
permissions:
  contents: read
  pull-requests: write   # only required for the PR comment
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin your version>
      - uses: actions/setup-node@<pin your version>
        with:
          node-version: 24
      - run: npm ci
      - uses: COD434/create-authenik8-app/.github/actions/authenik8-doctor@<pin your ref>
        with:
          mode: production     # default | deep | production
          offline: true        # use --offline when CI runs no services
```

Prerequisites and behavior:

- The project dependencies must be installed before the action runs; the
  Doctor loads the generated project's own `authenik8-core` engine.
- The action is read-only. It writes nothing into the project; its findings
  and the deterministic badge render only from Doctor's schema-versioned JSON
  report.
- Findings publish as the job step summary and, on pull requests, as a PR
  comment (edited in place across pushes). The comment needs
  `pull-requests: write` and the preinstalled GitHub CLI; without them the
  action still publishes the summary and the exit code.
- The composite uses only `bash`, `node`, and `npx` internally — no
  third-party actions to pin.
- The gate propagates Doctor's exit code, so a failing diagnostic fails the
  job. The summary renderer is covered by the repository's unit tests; the
  composite shell steps themselves have not been executed on a GitHub runner
  from this working environment.

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
