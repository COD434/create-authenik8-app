# Security Policy

## Supported Versions

We currently support security updates for:

- **`create-authenik8-app` CLI** and all generated templates (latest version on `main`)
- **`authenik8-core` Identity Engine** v1.0.3 and newer

**Requirements**: Node.js 18+ and Redis (required for secure token storage).

We recommend always using the latest CLI version.

## Reporting a Vulnerability

Security is a top priority for us.

**Do not report security issues publicly** on GitHub issues, discussions, or social media.

### How to report
1. Go to the [Security tab](https://github.com/COD434/create-authenik8-app/security)
2. Click **"Report a vulnerability"** (GitHub’s private reporting)

You can also email **authenik8@gmail.com**.

### What to include
- Description of the issue and potential impact
- Steps to reproduce
- Affected version(s)
- Any safe proof-of-concept (optional)

## Scope

**In scope**
- Issues in the open-source CLI and generated templates
- Default configuration and security features (JWT, refresh tokens, JTI protection, RBAC, rate limiting, etc.)

**Out of scope**
- Custom code added after generation
- Third-party dependencies (unless our usage creates a unique risk)

Reports about the closed-source `authenik8-core` Identity Engine are also welcome and will be handled privately.

## Fixed Vulnerabilities

### Vitest path traversal and js-yaml denial of service (September 2026)

`npm audit` reported 4 issues in development dependencies:

- `@vitest/mocker` below 4.1.11 allowed path traversal and arbitrary file reads through redirect mocks (GHSA-82fw-gwwq-j7x9, moderate). It reached the repo through `vitest` and `@vitest/coverage-v8`.
- `js-yaml` below 4.3.2 did not limit CPU use for empty merge sources, which allows denial of service (GHSA-2883-xcg3-v3hh, high). It reached the repo transitively through `@readme/openapi-parser`.

How we patched it:

- Bumped `vitest` and `@vitest/coverage-v8` to `^4.1.11` in the root `package.json` and in the fullstack template workspaces (`apps/api`, `apps/web`).
- Added an npm `overrides` entry forcing `js-yaml` to `^4.3.2` in the root and fullstack template manifests, following the existing override pattern.
- Verified with `npm audit` (0 vulnerabilities) in the CLI repo and in freshly generated `auth-oauth` projects.

### Lovable Doctor arbitrary code execution, CWE-94 (September 2026)

The `doctor frontend --target lovable [directory]` command resolved its validator script from `process.cwd()` first and the audited target directory second, then executed the first match with full process privileges and no trust check. Because a diagnostic command must never run code from the directory it audits, an attacker controlled working directory or a malicious target project could achieve code execution.

How we patched it:

- `findValidatorScript()` in `src/commands/lovableDoctor/index.ts` now resolves only the validator template packaged with the CLI. The target directory is passed to that trusted script as a data argument.
- Added regression tests in `tests/unit/lovableDoctor.test.ts` proving that scripts planted in the working directory or the target directory are ignored.
- Verified with a live reproduction: the attacker script no longer runs, and the packaged validator audits the target normally.

## Bounty / Reward Program

We are building a **community-supported reward program** for valuable security reports and contributions.

Because this is an early-stage project run by a solo developer, we start small and grow with the community:

- **Initial rewards**: Public recognition, credit in the README and Changelog, and a shout-out on X/Reddit
- **Future rewards**: As sponsorships and donations come in (via GitHub Sponsors and Polar.sh), we will add small monetary bounties

You can help the fund grow by sponsoring the project or funding specific issues on Polar.sh.

See issues labeled `bounty` for current opportunities.

## Response Timeline

- Acknowledgment: within 72 hours
- Triage: within 7 business days
- Updates: every 7–14 days
- Coordinated disclosure: aimed for within 90 days

## Safe Harbor

Good-faith security research following this policy is considered authorized. We will not pursue legal action against researchers who:
- Report responsibly through the channels above
- Avoid causing harm
- Keep the issue private until we have time to fix it

Thank you for helping make `create-authenik8-app` more secure! 🙏

---

*Last updated: September 13, 2026*
