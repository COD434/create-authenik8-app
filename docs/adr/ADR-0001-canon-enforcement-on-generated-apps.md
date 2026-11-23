# ADR-0001: Enforce the engineering canon on apps generated inside Studio

## Context

`CANON.md` states the canon is "normative for Authenik8 Studio, its generated projects, and every agent working in this repository." The builder subagent already carries `CANON_BUILD_PROMPT` and is told to run `canon_audit` after changing source files; the reviewer subagent carries `CANON_REVIEW_PROMPT`. The `canon_audit` tool accepts a path and can scan any directory.

Despite that authority, nothing mechanically enforces canon on an app a user builds inside Studio. The repository-level `npm run canon:audit` explicitly skips `.studio-sandbox` (the audit walker's `SKIP_DIRS`), so the mechanical gate never touches built apps. There is no server-side helper to run `auditProject` against a sandbox, and no requirement that critical/high canon findings on a built app be resolved before the build is treated as complete.

The risk: Studio can generate and let a user run/deploy an app that contains secrets in browser storage, SQL injection, wildcard CORS, swallowed failures, or other critical/high defects. That contradicts the canon's own authority and the non-negotiable that authorization and safety are server-side.

## Decision

Canon enforcement applies to apps generated inside Studio, scoped by severity:

- **Critical and high canon findings on a built app must be resolved before the build is considered complete.** The builder subagent runs `canon_audit` against the sandbox after writing source and must not report done with unresolved critical/high findings. The reviewer subagent surfaces these findings ordered by severity when reviewing a built app.
- **Medium and low findings are not build-blockers.** Generated code naturally produces medium findings (oversized units, etc.). Per canon severity, medium = "fix in this change or record a follow-up with an owner"; these are reported as follow-ups, not hard blocks, so the Studio remains usable for generated apps.
- The repository-level `npm run canon:audit` is unchanged and still skips `.studio-sandbox`. This prevents generated-code findings from flooding the Studio's own baseline. A separate, path-scoped audit helper runs `auditProject` against a given sandbox path on demand (used by subagents and optionally wired into export/deploy).
- `canon-ignore` on a line remains the supported suppression for verified false positives, including generated code.

## Consequences

Easier: generated apps are checked for security and correctness defects before the user runs or deploys them; subagents have a concrete canon standard to enforce.

Harder: builder subagents must spend tool budget on `canon_audit` and may need to rewrite generated code to clear critical/high findings. Generated apps may still ship with recorded medium/low follow-ups.

Accepted: the Studio's own code is governed by the repo baseline; generated apps are governed by a path-scoped audit, not the repo baseline.

## Revisit if

- Generated code can consistently pass critical/high canon, at which point tightening to medium may be reasonable.
- A real attack or incident traces to a generated app that passed review, in which case the gate should move earlier (export/deploy) or add rules.

## Boundary checklist

- One writer per business fact: the builder owns writes inside its lease; canon audit is read-only and does not write.
- Cross-context calls go through an explicit contract: `auditProject(sandboxRoot)` is a pure, read-only fitness function; no network, no writes.
- Errors are defined at the boundary: audit findings carry rule, file, line, message, and fix; they are leads, not verdicts.
- The module can be tested without the real vendor or network: `auditProject` reads local files only.

## Output contract

1. **Decision:** enforce canon critical/high on generated apps via subagents; medium/low are follow-ups.
2. **Map:** Studio repo (canon, baseline, audit CLI) -> sandbox root (generated app, path-scoped audit) -> subagents (builder/reviewer enforce).
3. **Contracts:** `auditProject(root)` returns `{ findings, ok }`; critical/high = blocking; builder/reviewer prompts updated.
4. **ADR path:** `docs/adr/ADR-0001-canon-enforcement-on-generated-apps.md`
5. **Fitness functions:** builder runs `canon_audit` on sandbox after writing source; reviewer reports canon findings on review; optional `auditProject(sandboxRoot)` gate before export/deploy.
6. **Risks:** generated code may never reach zero medium findings; blocking on medium would break Studio usability, so medium/low are deliberately not blockers.
