# Authenik8 Agent Guide

This repository follows the Authenik8 engineering canon. The canon is normative
for every human and agent working here. Read it before changing structure,
security, data, or public behavior.

- Canon: `packages/engineering-canon/canon/CANON.md`
- Rules: `packages/engineering-canon/canon/rules/`
- Skills: `packages/engineering-canon/skills/`
- Review agents: `.opencode/agents/`
- Audit: `npm run canon:audit` (repository baseline) or
  `node packages/engineering-canon/dist/cli.js <path>` (clean target)

## Two prime directives

1. Architecture before convenience. Make the next change local, not global.
2. Optimize for the next reader. Code is read far more often than written.

## Non-negotiables

1. No secret in client code, browser storage, URLs, logs, or source control.
2. Authorize every object and action on the server. Deny by default.
3. Validate untrusted input at the boundary; parse, do not assert.
4. No `any`, `@ts-ignore`, or `as unknown as` in committed application code.
5. No undocumented empty catch and no logged-and-ignored failure.
6. No import cycles between modules.
7. No SQL built by interpolation or concatenation.
8. No raw HTML sink on untrusted data.
9. No migration that is unsafe while the old code is still serving.
10. No behavior change without a test, and no bug fix without a regression test.

## Before you build

1. State the user outcome, constraints, and risk.
2. Identify the domain boundary, the data owner, and the trust boundary.
3. For a hard boundary or data model, design twice and write an ADR.
4. Build one thin end-to-end slice before breadth.
5. Add tests at the lowest useful level.

## Before you claim done

1. Run `npm run typecheck` and `npm run test`.
2. Run the canon audit on the changed area.
3. Fix every critical and high finding, or record why it is a false positive.
4. Update the README, ADR, API contract, or runbook that the change affects.
5. Report what you verified, not what you assumed.

## Rule lookup

| Area | File |
| --- | --- |
| Complexity, ETC, DRY, reversibility, tracer bullets | `canon/rules/00-foundations.md` |
| Boundaries, deep modules, coupling, aggregates, ADRs, cycles | `canon/rules/10-architecture.md` |
| Names, unit size, nesting, comments, cohesion | `canon/rules/20-readability.md` |
| Strict types, parsing, errors, async, modules | `canon/rules/30-typescript.md` |
| Schema, indexes, transactions, migrations, SQL | `canon/rules/40-data.md` |
| Authn, authz, secrets, crypto, JWT, CSRF, XSS, SSRF | `canon/rules/50-security.md` |
| Failure, idempotency, backpressure, observability | `canon/rules/60-reliability.md` |
| Complexity, data structures, invariants, intractability | `canon/rules/70-algorithms.md` |
| Legacy code, seams, characterization tests, contracts | `canon/rules/80-change.md` |
| Tests, CI, commits, docs, shipping | `canon/rules/90-delivery.md` |

## Review format

Report findings in severity order: critical, high, medium, low. For each finding
give the rule ID, file and line, evidence, impact, and the smallest safe fix. If
clean, say `No findings` and list what you checked. Do not report style
preferences as defects. Do not claim a finding you did not verify.

## Subagents

Use the read-only reviewers for independent checks:

- `architecture-reviewer` for boundaries, coupling, data ownership, cycles.
- `readability-reviewer` for names, unit size, nesting, comments, cohesion.
- `security-reviewer` for authn, authz, secrets, crypto, injection.
- `data-reviewer` for schema, indexes, transactions, migrations, SQL.
- `legacy-reviewer` for characterization tests, seams, contracts.
- `canon-auditor` to triage mechanical audit output.

## Changing the canon

Open an ADR, update the rule file and `CANON.md` index together, update the
affected skill or prompt, run the package tests, and run the audit. A rule may be
wrong for a specific context, but it must be wrong on the record, not by accident.
