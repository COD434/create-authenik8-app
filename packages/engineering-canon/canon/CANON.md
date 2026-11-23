# The Authenik8 Engineering Canon

**Status:** normative for Authenik8 Studio, its generated projects, and every
agent working in this repository. The canon is a distilled engineering
consensus, not a copy of any book. Each rule cites the book and chapter that
grounds it.

**Authority order.** (1) The user's explicit request and the safety rules of the
environment. (2) This canon. (3) Local repository conventions. When a local
convention conflicts with the canon, the canon wins unless the convention is
documented as a deliberate exception with an ADR.

## Two prime directives

1. **Architecture before convenience.** Make the next change local, not global.
2. **Optimize for the next reader.** Code is read far more often than it is
   written, including by agents.

## How to use the canon

- Read this file first. Load the one or two rule files that match the task, not
  all of them.
- Cite rule IDs in design notes and reviews, for example `A8-ARCH-02`.
- Use the `engineering-canon` skill as the router. Use the specialized skills
  for architecture, readability, review, security, data, TypeScript, algorithms,
  and legacy change.
- Run the mechanical audit before a hand review:
  `node packages/engineering-canon/dist/cli.js <path>`.
- A finding is a lead, not a verdict. Verify it in context. Never claim a
  finding you did not check.

## Severity

| Severity | Meaning | Action |
| --- | --- | --- |
| Critical | Secret exposure, auth bypass, data loss, remote code execution | Stop. Fix before anything else. |
| High | Correctness defect, broken authorization, architecture decay, swallowed failure | Fix before merge. |
| Medium | Maintainability risk, missing test, unclear boundary | Fix in this change or record a follow-up with an owner. |
| Low | Local readability or consistency issue | Fix when touching the code; never block a correctness fix on it. |

## Tie-breakers

When rules conflict, choose in this order:

1. Correctness and safety over elegance.
2. Security and privacy over convenience.
3. A simple design that can change over a flexible design that must be
   understood now.
4. Local readability over global cleverness.
5. Measured performance over speculative optimization.
6. Explicit tradeoffs over silent assumptions.

## The non-negotiables

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

## The daily loop

1. **Frame.** State the user outcome, the constraints, and the risk.
2. **Map.** Identify the domain boundary, the data owner, and the trust boundary.
3. **Design twice.** For a hard boundary, sketch two options and record the
   tradeoff in an ADR.
4. **Slice.** Build a thin end-to-end tracer bullet before breadth.
5. **Test.** Pin the behavior at the lowest useful level.
6. **Review.** Run the audit, then review in risk order.
7. **Ship.** Observe the metric, remove the flag, and update the runbook.

## Rule index

### Foundations

| ID | Rule |
| --- | --- |
| `A8-FND-01` | Complexity is the enemy |
| `A8-FND-02` | Design for change |
| `A8-FND-03` | DRY is about knowledge |
| `A8-FND-04` | Orthogonality |
| `A8-FND-05` | Reversibility |
| `A8-FND-06` | Tracer bullets |
| `A8-FND-07` | Design twice |
| `A8-FND-08` | No programming by coincidence |

### Architecture

| ID | Rule |
| --- | --- |
| `A8-ARCH-01` | Boundaries follow change and ownership |
| `A8-ARCH-02` | Deep modules |
| `A8-ARCH-03` | Information hiding |
| `A8-ARCH-04` | One layer, one abstraction |
| `A8-ARCH-05` | Pull complexity downward |
| `A8-ARCH-06` | Better together or better apart |
| `A8-ARCH-07` | Coupling and connascence |
| `A8-ARCH-08` | Aggregates are transaction boundaries |
| `A8-ARCH-09` | Explicit context maps |
| `A8-ARCH-10` | Record hard decisions in ADRs |
| `A8-ARCH-11` | Automate architecture with fitness functions |
| `A8-ARCH-12` | Keep dependencies acyclic |
| `A8-ARCH-13` | Prefer a modular monolith first |
| `A8-ARCH-14` | Define errors out of existence |

### Readability

| ID | Rule |
| --- | --- |
| `A8-READ-01` | Small, single-purpose units |
| `A8-READ-02` | Flatten control flow |
| `A8-READ-03` | Precise names |
| `A8-READ-04` | Comments add missing context |
| `A8-READ-05` | Obvious code |
| `A8-READ-06` | Consistency |
| `A8-READ-07` | Organize by knowledge, not time |
| `A8-READ-08` | Separate policy from mechanism |
| `A8-READ-09` | Pure core, imperative shell |
| `A8-READ-10` | Errors are part of the interface |
| `A8-READ-11` | No dead weight |

### TypeScript

| ID | Rule |
| --- | --- |
| `A8-TS-01` | Strict, no any |
| `A8-TS-02` | Make illegal states unrepresentable |
| `A8-TS-03` | Parse at the boundary |
| `A8-TS-04` | Discriminated unions over flags |
| `A8-TS-05` | Errors are explicit |
| `A8-TS-06` | Casts are debt |
| `A8-TS-07` | Immutability by default |
| `A8-TS-08` | Async discipline |
| `A8-TS-09` | Explicit module boundaries |
| `A8-TS-10` | Type suppressions are bugs |

### Data

| ID | Rule |
| --- | --- |
| `A8-DATA-01` | Model the domain, not the screen |
| `A8-DATA-02` | Normalize, then document denormalization |
| `A8-DATA-03` | Keys and constraints |
| `A8-DATA-04` | Index real access paths |
| `A8-DATA-05` | Transactions and isolation |
| `A8-DATA-06` | Safe migrations |
| `A8-DATA-07` | Parameterized SQL |
| `A8-DATA-08` | Consistency and idempotency |
| `A8-DATA-09` | Keyset pagination |
| `A8-DATA-10` | Canonical representations |

### Security

| ID | Rule |
| --- | --- |
| `A8-SEC-01` | Server-side sessions |
| `A8-SEC-02` | Server-side authorization |
| `A8-SEC-03` | Validate untrusted input |
| `A8-SEC-04` | Secrets stay server-side |
| `A8-SEC-05` | Use vetted cryptography |
| `A8-SEC-06` | Verify JWTs completely |
| `A8-SEC-07` | Cookies and CSRF |
| `A8-SEC-08` | Contextual output encoding |
| `A8-SEC-09` | SSRF, command injection, and path traversal |
| `A8-SEC-10` | Security logging and rate limits |
| `A8-SEC-11` | Supply-chain hygiene |
| `A8-SEC-12` | Threat model first |

### Reliability

| ID | Rule |
| --- | --- |
| `A8-REL-01` | Design for failure |
| `A8-REL-02` | Idempotency |
| `A8-REL-03` | Backpressure and bounds |
| `A8-REL-04` | Observability |
| `A8-REL-05` | Fail fast, no silent catch |
| `A8-REL-06` | Graceful degradation |
| `A8-REL-07` | Concurrency discipline |
| `A8-REL-08` | Durability and restore |
| `A8-REL-09` | Measure before optimizing |

### Algorithms

| ID | Rule |
| --- | --- |
| `A8-ALG-01` | State complexity |
| `A8-ALG-02` | Choose the data structure |
| `A8-ALG-03` | Use proven algorithms |
| `A8-ALG-04` | Invariants and termination |
| `A8-ALG-05` | Test edge cases and properties |
| `A8-ALG-06` | Know intractability |
| `A8-ALG-07` | Bound recursion |
| `A8-ALG-08` | Numeric correctness |

### Change

| ID | Rule |
| --- | --- |
| `A8-CHG-01` | Pin behavior first |
| `A8-CHG-02` | Find the seam |
| `A8-CHG-03` | Sense and separate |
| `A8-CHG-04` | Small, reversible steps |
| `A8-CHG-05` | Refactor separately |
| `A8-CHG-06` | Understand before changing |
| `A8-CHG-07` | Adapters over mock sprawl |
| `A8-CHG-08` | Preserve contracts |
| `A8-CHG-09` | Every bug fix leaves a test |

### Delivery

| ID | Rule |
| --- | --- |
| `A8-DEL-01` | Automated tests |
| `A8-DEL-02` | Deterministic tests |
| `A8-DEL-03` | CI gates |
| `A8-DEL-04` | Small commits |
| `A8-DEL-05` | Reproducible builds |
| `A8-DEL-06` | Automate repetition |
| `A8-DEL-07` | Review for risk, not style |
| `A8-DEL-08` | Documentation as part of done |
| `A8-DEL-09` | Estimate in ranges |
| `A8-DEL-10` | Ship, observe, iterate |

## Source key

| Key | Work |
| --- | --- |
| APoSD | *A Philosophy of Software Design* (John Ousterhout) |
| PP | *The Pragmatic Programmer* (Hunt and Thomas, 20th anniversary edition) |
| SAHP | *Software Architecture: The Hard Parts* (Ford, Richards, Sadalage, Dehghani) |
| DDDD | *Domain-Driven Design Distilled* (Vaughn Vernon) |
| WELC | *Working Effectively with Legacy Code* (Michael Feathers) |
| ETS | *Effective TypeScript* (Dan Vanderkam) |
| PTS | *Programming TypeScript* (Boris Cherny) |
| DDIA | *Designing Data-Intensive Applications* (Martin Kleppmann) |
| DBI | *Database Internals* (Alex Petrov) |
| SQL | *Learning SQL* (Alan Beaulieu) |
| WAHH | *The Web Application Hacker's Handbook* (Stuttard and Pinto) |
| RWC | *Real-World Cryptography* (David Wong) |
| JWT | *The JWT Handbook* (Sebastian Peyrott) |
| CLRS | *Introduction to Algorithms* (Cormen, Leiserson, Rivest, Stein) |
| ADM | *The Algorithm Design Manual* (Steven Skiena) |
| GA | *Grokking Algorithms* (Aditya Bhargava) |
| SICP | *Structure and Interpretation of Computer Programs* (Abelson and Sussman) |
| K&R | *The C Programming Language* (Kernighan and Ritchie) |

## Changing the canon

1. Open an ADR that states the new evidence, the rule it changes, and the
   migration cost.
2. Update the rule file and this index together.
3. Update the affected skill, agent prompt, and Studio prompt fragment.
4. Run `npm run test --workspace @authenik8/engineering-canon`.
5. Run the audit on the changed package and fix every high or critical finding.

The canon is intentionally opinionated. A rule may be wrong for a specific
context, but it must be wrong on the record, not by accident.
