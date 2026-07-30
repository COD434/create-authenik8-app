# CLI reference

## Generation options

| Option | Purpose |
| --- | --- |
| `--package-manager npm\|pnpm\|bun` | Select the installer for an Express preset |
| `--yes`, `--non-interactive` | Generate without prompts; requires `--preset` and applicable choices |
| `--preset base\|auth\|auth-oauth\|fullstack` | Select the deterministic preset |
| `--prisma`, `--no-prisma` | Choose Prisma for the base preset |
| `--database sqlite\|postgresql` | Select the database for a Prisma-backed Express preset |
| `--oauth google,github`, `--no-oauth` | Select providers or explicitly disable them for fullstack |
| `--git`, `--no-git` | Choose Git initialization; non-interactive mode defaults off |
| `--runtime node\|bun` | Select the runtime for `--production-ready` Express output |
| `--no-install` | Generate files without installing dependencies |
| `--resume` | Continue an interrupted generation |
| `--production-ready` | Add PM2 configuration to an Express preset |
| `--version` | Print the installed CLI version |

## Project commands

Diagnostics:

```text
create-authenik8-app doctor [directory] [options]
```

| Option | Purpose |
| --- | --- |
| `--deep` | Run isolated Redis and installed-core lifecycle checks |
| `--production` | Run deep checks plus production policy |
| `--check A8-...` | Run one stable diagnostic and its prerequisites |
| `--explain A8-...` | Explain a diagnostic without loading a project |
| `--fix`, `--fix --dry-run` | Apply or preview eligible safe fixes |
| `--json` | Print schema-versioned JSON |
| `--ci` | Print deterministic output without colour |
| `--strict` | Fail when warnings are present |
| `--report` | Write a sanitized private support report |
| `--offline` | Validate `.env.example` without live services or disk secrets |
| `--skip-services` | Legacy service-skip mode |

Operational maintenance:

```text
create-authenik8-app ops readiness [directory] [--json]
create-authenik8-app ops audit production [directory] [--json]
create-authenik8-app ops verify oauth [google|github] [directory] [--json]
create-authenik8-app ops rotate signing-key [directory] [options]
create-authenik8-app ops revoke user <user-id> [directory] --all-sessions [options]
```

Rotation and revocation are plan-only unless `--apply` is present. Rotation
uses a two-phase stage/deploy/activate protocol and requires
`--confirm-active-kid`. Revocation requires the exact target in
`--confirm-user` and an operator `--reason`. See the
[operational maintenance guide](operational-maintenance.md) before applying
either mutation.

Post-generation recipes:

```text
create-authenik8-app add <recipe> [directory] [--dry-run]
create-authenik8-app add --list
```

Upgrade policy:

```text
create-authenik8-app upgrade [directory] [--check] [--json]
create-authenik8-app upgrade [directory] --acknowledge [--json]
```

The focused guides explain [non-interactive generation](non-interactive-generation.md), [Doctor](project-diagnostics.md), [operational maintenance](operational-maintenance.md), [recipes](post-generation-recipes.md), and [upgrade policy](upgrades-and-ci.md).

[Back to the documentation index](../README.md#documentation)
