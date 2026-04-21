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

You can also email **security@create-authenik8.app**.

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

*Last updated: April 21, 2026*
