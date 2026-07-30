# Lovable frontend integration

> Vibe-code the interface. Keep identity on a backend you own.

Lovable generates and edits the browser UI. Authenik8 remains responsible for
identity, OAuth, refresh rotation, Redis-backed sessions and revocation, roles,
administrator operations, audit events, data, and secrets. The integration
does not enable Lovable Cloud auth, Supabase auth, or a second backend.

Generate the complete integration path:

```bash
npx create-authenik8-app my-app --yes --preset fullstack \
  --frontend lovable --oauth google,github --git
cd my-app
npm run dev
```

The generated `integrations/lovable/` directory contains the staged prompt,
OpenAPI 3.1 contract, frontend contract, security rules, public environment
example, and acceptance checklist. `apps/web` remains the tested React
reference.

## Guides

- [Five-minute quickstart](lovable/quickstart.md)
- [Current API and client contract](lovable/current-auth-contract.md)
- [Session and supported domain model](lovable/session-and-domain-model.md)
- [Railway API + Lovable frontend deployment](lovable/deployment.md)
- [Security and threat boundary](lovable/security-model.md)
- [Google and GitHub OAuth](lovable/oauth.md)
- [CORS, Origin, and cookies](lovable/cors-and-cookies.md)
- [Lovable Doctor validator](lovable/validator.md)
- [Troubleshooting](lovable/troubleshooting.md)
- [FAQ](lovable/faq.md)
- [Reference-spike findings](lovable/spike-findings.md)
- [Release checklist](lovable/release-checklist.md)

## Supported boundary

The recommended production layout is
`https://app.example.com` plus `https://api.example.com`. A same-origin
reverse proxy is also supported. A `*.lovable.app` preview is cross-site from
your API and is not supported for the complete strict-cookie lifecycle. Use it
for visual work, then test authentication on a same-site custom domain.

Frontend route guards are user-experience controls. Authenik8 middleware and
resource policies are the authorization boundary.

[Back to the documentation index](../README.md#documentation)
