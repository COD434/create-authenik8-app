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

## Resource scaffolding (fullstack)

The `resource` recipe extends a generated fullstack project with one scalar-field CRUD resource. It mirrors the included `projects` family: Prisma model plus owner relation, shared Zod contracts, a complete API module (policy, repository, service, controller, routes) wired into `app.ts`, OpenAPI source additions, and typed-client additions.

```bash
npx create-authenik8-app@latest add resource Invoice --fields "amount:number,dueAt:date?" --dry-run
npx create-authenik8-app@latest add resource Invoice --fields "amount:number,dueAt:date?"
```

The name can also be passed explicitly with `--name`, and a project directory can follow the name. Supported field types are `string`, `number`, `boolean`, and `date`; a trailing `?` marks the column nullable and the contract input optional. Field and resource names are validated as TypeScript identifiers before any code is generated, and enum-typed fields, generated tests, and React screens are not part of the scaffold yet.

Every instance is owned: read/write access is `ADMIN` or the owning user, list is scoped by owner, and identifiers are parsed with the shared contract schemas before use. The scaffold touches generated stock files only at anchored insertion points and refuses to guess when a file does not match the stock shape.

After applying a resource:

```bash
npm run build:packages
npm run db:generate
npm run db:migrate
npm run openapi:generate
npm run openapi:check
```

Applying the same resource again is a verified no-op; different resources can be scaffolded on the same project.

[Back to the documentation index](../README.md#documentation)
