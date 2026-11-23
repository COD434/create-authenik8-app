---
name: Code Review
description: Review a change against the Authenik8 canon in risk order, with severity-ordered findings, rule IDs, evidence, and the smallest safe fix
---

# Code Review

Use after a build, before export, or whenever a diff needs an independent review.
Read `../../canon/CANON.md` and the rule files named by the findings.

## Review order

1. **Security and data loss.** Secrets, authn, sessions, authz, injection,
   crypto, CSRF, SSRF, unsafe migrations, destructive writes.
2. **Correctness and authorization.** Does it do the stated thing? Are edge
   cases handled? Is every object and action authorized server-side?
3. **Architecture and coupling.** Boundaries, data ownership, cycles, leaking
   abstractions, distributed transactions, missing ADR.
4. **Readability.** Names, unit size, nesting, comments, cohesion, dead code.
5. **Tests and operability.** Regression coverage, deterministic tests,
   observability, failure path, runbook.

Formatting is not a review finding unless it hides a defect. Leave it to the
formatter.

## Workflow

1. **Scope.** Read the task, the diff, and the surrounding code. List what is
   in and out of scope.
2. **Run the audit.** From the repository root:

   ```sh
   node packages/engineering-canon/dist/cli.js <path> --json
   ```

   Treat each result as a lead, not a verdict.
3. **Read for intent.** Can you state the change in one sentence? If not, the
   design or the description is unclear.
4. **Trace the risk paths.** Follow one untrusted input to its sink. Follow one
   authenticated request to the authorization check. Follow one failure to the
   caller.
5. **Verify each finding.** Open the file, read the context, and confirm the
   behavior. Do not report a pattern match you did not verify.
6. **Order by severity.** Critical, high, medium, low. Stop at the first
   critical finding and report it before continuing.
7. **Name the smallest fix.** Prefer a local change over a rewrite. If the fix is
   large, say why.

## Finding format

```text
[high] A8-SEC-02 src/orders/routes.ts:42
  evidence: GET /orders/:id loads by id and returns it without checking owner or tenant
  impact: any signed-in user can read another tenant's order (IDOR)
  fix: load through a policy that filters by tenant and owner; return 404 when absent
```

Include the rule ID, file and line, evidence, impact, and the smallest safe fix.
If there are no findings, say `No findings` and list what you checked. Never
claim a test or a command you did not run.

## What not to report

- A style preference with no correctness or readability impact.
- A hypothetical issue you cannot tie to a real path.
- A missing abstraction that the change does not need.
- A rewrite proposal disguised as a finding.
- A finding copied from the audit without checking the context.

## Output contract

1. **Verdict:** block, approve with fixes, or approve.
2. **Findings:** severity order, with rule IDs and evidence.
3. **Checks run:** audit, typecheck, tests, manual paths.
4. **Residual risk:** what you could not verify.

## Stop conditions

- A critical security or data-loss finding: report it immediately and do not
  continue to low-severity polish.
- The diff is too large to review safely: ask for a split by intent.
- The code cannot be understood without running it: ask for a characterization
  test or a smaller change.
