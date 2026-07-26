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
create-authenik8-app doctor [directory] [--json] [--skip-services]
```

Post-generation recipes:

```text
create-authenik8-app add <recipe> [directory] [--dry-run]
create-authenik8-app add --list
```

Upgrade policy:

```text
create-authenik8-app upgrade [directory] [--check] [--json]
```

The focused guides explain [non-interactive generation](non-interactive-generation.md), [Doctor](project-diagnostics.md), [recipes](post-generation-recipes.md), and [upgrade policy](upgrades-and-ci.md).

[Back to the documentation index](../README.md#documentation)
