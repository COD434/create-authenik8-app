# Project diagnostics

Run Doctor from the generated project root after starting its services:

```bash
npx create-authenik8-app@latest doctor
```

Doctor validates:

- Generated structure and manifest
- Installed `authenik8-core` version
- Private ES256 signing key, issuer, audience, and refresh secret
- Agent scopes
- Database URL
- Enabled OAuth providers
- Git secret safety
- Local in-process Redis configuration or a real Redis `PING` for external services

Doctor never prints secret values.

The generator runs these static checks automatically before the project is marked ready. Doctor recognizes the local in-process store without opening a network connection and sends a live `PING` when external Redis is configured. A `--no-install` generation validates everything it can and warns that the declared engine still needs to be installed.

For CI or an environment where services are intentionally unavailable, use machine-readable output without live probes:

```bash
npx create-authenik8-app@latest doctor --json --skip-services
```

Every new project includes a source-controlled `authenik8.json`. This schema-versioned manifest records only architectural choices and generator and engine versions. It never records keys, credentials, tokens, environment values, or timestamps. Doctor uses it to detect drift while retaining structural compatibility for projects generated before manifests existed.

[Back to the documentation index](../README.md#documentation)
