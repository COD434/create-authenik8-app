# @authenik8/engineering-canon

The engineering canon for Authenik8 Studio: a distilled, cited set of rules for
architecture and readability, plus skills, review agents, and a mechanical audit.
The canon is original synthesis, not a reproduction of book text. Each rule names
the book and chapter that grounds it.

## Why

Agents are fast but inconsistent. A shared canon gives every agent, reviewer, and
generated project the same definition of "good": deep modules, explicit
boundaries, readable code, safe data, and tested changes. The canon is short
enough to load on demand and specific enough to cite in a review.

## Layout

```text
canon/
  CANON.md                 authority, severity, non-negotiables, rule index
  rules/00-foundations.md
  rules/10-architecture.md
  rules/20-readability.md
  rules/30-typescript.md
  rules/40-data.md
  rules/50-security.md
  rules/60-reliability.md
  rules/70-algorithms.md
  rules/80-change.md
  rules/90-delivery.md
skills/                    OpenCode skills, one directory per skill
src/                       prompt fragments and the audit implementation
tests/                     audit and canon integrity tests
```

## Use

Build the package, then run the audit:

```sh
npm run build --workspace @authenik8/engineering-canon
node packages/engineering-canon/dist/cli.js <path>
node packages/engineering-canon/dist/cli.js <path> --json
node packages/engineering-canon/dist/cli.js <path> --strict
node packages/engineering-canon/dist/cli.js <path> --baseline canon-baseline.json
node packages/engineering-canon/dist/cli.js <path> --write-baseline canon-baseline.json
```

Exit code 0 means no critical or high findings. Exit code 1 means at least one
blocking finding. `--strict` also fails medium and low findings. `--baseline`
excludes findings that were reviewed and recorded; matching uses the rule, file,
and a number-normalized message, so unrelated line shifts do not resurface
accepted debt while a new finding still fails. `--write-baseline` records the
current findings for review before committing. The repository root uses
`canon-baseline.json` for existing Studio debt; `npm run canon:audit` applies it.

From code:

```ts
import { auditProject, formatCanonFindings } from "@authenik8/engineering-canon";

const result = await auditProject("./apps/web-studio");
if (!result.ok) console.error(formatCanonFindings(result));
```

Prompt fragments for the Studio runtime:

```ts
import { CANON_BUILD_PROMPT, CANON_REVIEW_PROMPT } from "@authenik8/engineering-canon";
```

## Skills

| Skill | Purpose |
| --- | --- |
| `engineering-canon` | Router: authority, non-negotiables, rule lookup, audit, review format |
| `architecture-design` | Boundaries, deep modules, ADRs, fitness functions |
| `readability-craft` | Names, small units, flat control flow, comments, cohesion |
| `code-review` | Risk-ordered review with rule IDs and evidence |
| `legacy-change` | Characterization tests, seams, adapters, small steps |
| `security-review` | Threat model and web security checklist |
| `data-systems` | Schema, indexes, transactions, migrations, SQL |
| `typescript-craft` | Strict types, boundary parsing, errors, async |
| `algorithm-choice` | Complexity, data structures, invariants, edge cases |

Wire them into OpenCode with the config `skills` array:

```jsonc
{
  "skills": [
    "C:/<path>/authenik8/packages/design/skills",
    "C:/<path>/authenik8/packages/engineering-canon/skills"
  ]
}
```

## Audit rules

The mechanical audit is deliberately high-signal. It catches:

- relative import cycles;
- oversized files and functions;
- explicit `any`, double casts, and type-check suppression;
- undocumented empty catches and logged-and-ignored catch blocks;
- hard-coded secret literals and credentials in browser storage;
- raw HTML sinks and dynamic code execution;
- wildcard CORS;
- SQL interpolation or concatenation, and `SELECT *`;
- weak password hashing and `Math.random` for security values;
- JWTs that allow the `none` algorithm.

It does not judge domain correctness, authorization logic, or whether a boundary
is in the right place. Treat findings as leads and verify them in context.

## Suppressions

A finding can be a false positive. Suppress it on the finding's line, with the
rule ID and a reason:

```ts
host.innerHTML = trustedHtml; // canon-ignore A8-SEC-08: sanitized by renderTrusted
```

Use this only after verifying the value in context. A bare `canon-ignore`
suppresses every rule on that line and is reserved for generated code. A
suppression is a reviewable assertion, not a way to silence a real defect.

## Accepted debt

The baseline is for debt that is real, reviewed, and scheduled, not for
silencing a defect. Every entry names the rule, file, and message, so the file
reads as a debt register. Regenerate it only when the debt changes:

```sh
npm run canon:baseline
```

A new critical or high finding fails even when the baseline is present. Remove
entries by fixing the code, not by editing the file. When a baselined file is
split, the old entry stops matching and disappears on the next regeneration.

## Boundaries

- Reads only text files under the target root; skips `node_modules`, `.git`,
  build output, and `.authenik8`.
- No network, no writes, no code execution.
- File reads are capped at 512 KiB; findings are capped at 200.
- The audit is a fitness function, not a security scanner or a replacement for
  review.

## Changing the canon

1. Write an ADR with the evidence and the migration cost.
2. Update the rule file and `canon/CANON.md` index together.
3. Update the affected skill, agent prompt, and Studio prompt fragment.
4. Run `npm run test --workspace @authenik8/engineering-canon`.
5. Run the audit on the changed package and fix every high or critical finding.
