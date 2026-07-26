# Non-interactive generation

Use `--yes` or `--non-interactive` for deterministic scripts and CI. Security-relevant choices must be explicit. Incomplete or contradictory combinations fail before the destination is created.

```bash
# Password API with PostgreSQL
npx create-authenik8-app my-api --yes --preset auth --database postgresql --no-git

# OAuth API with only GitHub, generated without installing
npx create-authenik8-app my-api --yes --preset auth-oauth --database sqlite --oauth github --no-git --no-install

# Fullstack with password auth and no OAuth providers
npx create-authenik8-app my-app --yes --preset fullstack --no-oauth --git
```

The base preset requires `--prisma` plus a database, or `--no-prisma`. The OAuth API requires at least one provider. Fullstack requires an explicit `--oauth` list or `--no-oauth`. Its PostgreSQL, Prisma, Node.js, and npm workspace choices remain fixed.

Interactive fullstack generation defaults to password-only so a developer can reach a working application without creating OAuth provider credentials. Non-interactive generation keeps this security-relevant choice explicit through `--oauth` or `--no-oauth`.

See the [CLI reference](cli-reference.md) for every supported option.

[Back to the documentation index](../README.md#documentation)
