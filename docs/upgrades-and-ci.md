# Upgrade planning and CI policy

Upgrade planning is read-only. It compares `authenik8.json`, the declared and
installed `authenik8-core`, and the running CLI's template contract:

```bash
npx create-authenik8-app@latest upgrade
npx create-authenik8-app@latest upgrade --json
npx create-authenik8-app@latest upgrade --check --json
```

`--check` exits with status 1 when an upgrade is pending or blocked. Engine
install commands use exact-save syntax; ranges and tags are rejected because a
later install could cross an unaudited authentication boundary.

Follow the ordered plan: review security migrations, install the exact engine
target, run deep Doctor diagnostics, exercise application auth flows, and then
acknowledge the verified releases:

```bash
npx create-authenik8-app@<planned-version> doctor --deep --ci
npx create-authenik8-app@<planned-version> upgrade --acknowledge
```

Acknowledgement refuses a missing installation, a version range, declaration
and installation drift, a CLI/core contract mismatch, a downgrade, or a failed
deep core verification. It reruns the focused deep Doctor boundary immediately
before the write, then atomically changes only `generatedBy.version` and
`engine.version` in `authenik8.json`; it never rewrites application code.

## GitHub Actions gate

Commit the package-manager lockfile, then preview and apply the workflow:

```bash
npx create-authenik8-app@latest add ci-github --dry-run
npx create-authenik8-app@latest add ci-github
```

The managed workflow:

- Uses the frozen npm, pnpm, or Bun lockfile
- Pins the CLI, package-manager bootstrap, and GitHub actions
- Disables checkout credential persistence
- Grants read-only repository contents permission
- Runs `doctor --ci --offline --strict` without repository auth secrets
- Enforces `upgrade --check --json`

Offline Doctor validates `.env.example` using authentication values held only
in memory. The recipe refuses to overwrite an unmanaged workflow or a managed
workflow containing local edits.

[Back to the documentation index](../README.md#documentation)
