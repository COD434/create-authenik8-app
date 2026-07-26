# Post-generation recipes

Generated OAuth API and fullstack projects can enable another built-in provider without regenerating the application. Preview the exact change first:

```bash
npx create-authenik8-app@latest add oauth-github --dry-run
```

Apply it from the project root, or pass a project directory:

```bash
npx create-authenik8-app@latest add oauth-github
npx create-authenik8-app@latest add oauth-google ./my-app
npx create-authenik8-app@latest add --list
```

Recipes are local, versioned with the CLI, and selected through `authenik8.json`. They do not download or execute remote code.

`--diff` is an alias for `--dry-run`. Previews redact `.env` values, and dry runs perform no writes. Apply uses guarded writes with post-apply verification and rollback. For Express OAuth projects, a recipe refuses to overwrite generator-managed auth files after local edits, so auth policy changes are never silently discarded.

The recipe registry also includes the managed [GitHub CI policy](upgrades-and-ci.md).

[Back to the documentation index](../README.md#documentation)
