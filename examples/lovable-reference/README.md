# Official Lovable reference workflow

The executable reference application is generated at `apps/web` by:

```bash
npx create-authenik8-app team-projects --yes --preset fullstack \
  --frontend lovable --oauth google,github
```

It includes landing/authentication, dashboard, Project CRUD, profile,
password/provider/session security, administrator users/roles/status/session
revocation, and audit events. Projects are the maintained reference resource
for this release; the security lifecycle is equivalent to the proposed Team
Notes demo without adding a second CRUD model.

```text
Lovable / React browser UI (public, untrusted)
                 │
                 │ @authenik8/api-client
                 ▼
Authenik8 Express API (identity + authorization boundary)
        ├── PostgreSQL (users, projects, sessions, audit)
        ├── Redis (identity sessions, OAuth, rotation locks)
        └── backend secret store
```

For a separate Lovable repository, export and commit the generated client
archives, apply the seven staged prompts, and run the validator against that
checkout. See [the full quickstart](../../docs/lovable/quickstart.md).

The private, unpublished public-layout reference spike is
[open in Lovable](https://lovable.dev/projects/7e827f80-d6a9-4888-a41a-7bd7797a89d6).
Its recorded baseline commit is
`6ea99b8c7c0e5381d3de7e3078ea33ee80955b4b`; it intentionally stops before
client/auth wiring.

## Demo reset

Local `npm run setup` is idempotent. For a disposable demo, remove only the
generated project’s `.authenik8/` local data directory after stopping its
processes, then rerun setup. Never use that reset procedure against production.

Demo accounts and public hosting are deployment-specific. Do not commit real
credentials. The generated local seed administrator is documented in the
generated `.env` and must be changed in any shared environment.

## Known limitations

- Full cookie sessions are not supported on a cross-site `lovable.app` preview.
- Email verification exists but is not currently a mandatory policy for every
  protected resource.
- A public hosted demo, video, and provider credentials are release assets, not
  embedded repository secrets.
- Lovable/GitHub two-way sync must be reviewed; it is not an authorization
  mechanism.
