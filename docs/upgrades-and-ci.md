# Upgrade planning and CI policy

Upgrade analysis is read-only. It compares the project manifest, declared and installed `authenik8-core`, and the running CLI's template contract:

```bash
npx create-authenik8-app@latest upgrade
npx create-authenik8-app@latest upgrade --json
npx create-authenik8-app@latest upgrade --check --json
```

`--check` exits non-zero when an upgrade is pending or the plan is blocked by drift or a downgrade. Security-significant engine boundaries produce explicit review steps before any dependency command. The planner never rewrites application auth code or updates the manifest on its own.

## Add the GitHub Actions gate

Commit the project's package-manager lockfile, then preview and apply the workflow:

```bash
npx create-authenik8-app@latest add ci-github --dry-run
npx create-authenik8-app@latest add ci-github
```

The managed workflow installs from the lockfile, runs Doctor without live services, and enforces `upgrade --check`. The CLI and package-manager bootstrap versions are pinned, actions use full commit SHAs, and workflow permissions are read-only. The recipe never overwrites an existing unmanaged workflow or a locally modified managed workflow.

[Back to the documentation index](../README.md#documentation)
