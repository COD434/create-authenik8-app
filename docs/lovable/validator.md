# Authenik8 Lovable Doctor

Run the generated validator from the Authenik8 repository:

```bash
npm run doctor:lovable -- /path/to/lovable-frontend
```

Or:

```bash
npx create-authenik8-app@latest doctor frontend \
  --target lovable /path/to/lovable-frontend
```

Use `--json` for CI. Findings contain `PASS`, `WARN`, or `FAIL`, a stable rule
ID, file and line when available, plain-language risk, and remediation.
Security failures exit non-zero.

Static checks cover browser token storage, Supabase/Lovable auth, duplicate
auth calls, frontend secrets/private JWKs, wildcard credentialed CORS,
editable-role trust, direct admin calls, generated-client use, and API URL
configuration.

Add non-destructive runtime checks only against an approved test deployment:

```bash
npm run doctor:lovable -- /path/to/frontend --runtime \
  --api-url https://api.staging.example.com \
  --origin https://app.staging.example.com
```

Runtime mode checks liveness, unauthenticated current-user behavior, invalid
refresh rejection, public JWKS fields, approved CORS, and lookalike-origin
blocking. Registration, login, OAuth completion, logout, and destructive
session tests remain in the manual acceptance checklist so the validator never
creates accounts or revokes a production session without an explicit test
workflow.

The validator is a focused integration check, not a security certification.
