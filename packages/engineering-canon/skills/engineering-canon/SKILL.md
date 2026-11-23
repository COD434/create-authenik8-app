---
name: Engineering Canon
description: Load the Authenik8 engineering canon before architecture work, multi-file builds, code review, or legacy changes; routes to the right rule file and the mechanical audit
---

# Engineering Canon

Use this skill whenever a task changes structure, crosses a boundary, touches
security or data, or will be reviewed by another agent. It is the router, not a
substitute for the specialized skills.

## Authority

The canon is normative for Authenik8 Studio and generated projects. Read
`../../canon/CANON.md` first. If a local convention conflicts with the canon,
the canon wins unless an ADR records a deliberate exception.

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

## Workflow

1. **Route.** Pick the one or two rule files the task needs from the table below.
2. **Load.** Read `canon/CANON.md` and those files. Do not load the whole canon.
3. **Apply.** Use the rule IDs in the design note, the code, or the review.
4. **Audit.** Run the mechanical audit on the changed path.
5. **Verify.** Confirm each finding in context, then fix or dismiss it with a reason.

## Routing

| Task | Load |
| --- | --- |
| New module, service, boundary, data ownership, cross-cutting flow | `architecture-design` and `canon/rules/10-architecture.md` |
| New code or a readability pass | `readability-craft` and `canon/rules/20-readability.md` |
| Review a diff or a project | `code-review` and the rule files named by the findings |
| Unfamiliar or legacy code | `legacy-change` and `canon/rules/80-change.md` |
| Auth, sessions, secrets, crypto, input handling | `security-review` and `canon/rules/50-security.md` |
| Schema, index, transaction, migration, SQL | `data-systems` and `canon/rules/40-data.md` |
| Types, parsing, errors, async | `typescript-craft` and `canon/rules/30-typescript.md` |
| Algorithm or data-structure choice | `algorithm-choice` and `canon/rules/70-algorithms.md` |
| Tests, CI, commits, operability | `canon/rules/90-delivery.md` |

Load only the files the task needs. Do not dump the whole canon into context.

## Mechanical audit

From the repository root:

```sh
npm run build --workspace @authenik8/engineering-canon
node packages/engineering-canon/dist/cli.js <path> --json
```

Exit 0 means no critical or high findings. Exit 1 means at least one blocking
finding. `--strict` also fails medium and low findings. `--baseline <file>`
excludes findings already reviewed and recorded in `canon-baseline.json`; a new
critical or high finding still fails. `--write-baseline <file>` records current
findings for review; regenerate it only when the debt changes.

Treat every finding as a lead. Verify it in context before reporting or fixing.
The audit catches import cycles, unsafe types, swallowed errors, secret literals,
browser token storage, raw HTML sinks, unsafe SQL, weak password hashing, and
oversized units. It cannot judge domain correctness, authorization logic, or
whether a boundary is in the right place.

## Review output contract

Report findings in severity order:

```text
[high] A8-ARCH-12 src/orders/service.ts:14 import cycle: service.ts -> repo.ts -> service.ts
  evidence: service.ts imports repo.ts; repo.ts imports service.ts for a shared type
  impact: the two modules cannot be tested or deployed independently
  fix: move the shared type to src/orders/contracts.ts and invert the repo import
```

For each finding include the rule ID, file and line, evidence, impact, and the
smallest safe fix. If clean, say `No findings` and list what you checked. Never
report a style preference as a defect.

## Stop conditions

Stop and ask, or report a blocker, when:

- the change would put a secret or token in the client;
- authorization depends on a client-controlled value;
- a data migration is destructive and has no backup or rollback;
- the only fix is to disable a security control;
- the task requires a public contract change with no migration path.
