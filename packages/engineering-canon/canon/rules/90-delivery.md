# Delivery

A design is not done when it compiles. It is done when it is tested, reviewable,
observable, and safe to change. These rules connect the canon to the daily loop.

### A8-DEL-01 Automated tests

**Rule.** Every behavior change has an automated test at the lowest useful level.
Prefer a unit test for a pure rule, an integration test for a boundary, and an
end-to-end test for a critical user path.

**In practice.** Test behavior, not implementation. Cover the failure path and the
boundary values. Keep the test close to the code it protects. If a test is hard to
write, treat that as design feedback.

**Smell.** A feature with no test. A test that only checks a mock was called. A
test suite that takes minutes for a pure function. A bug fix with no regression
test.

**Source.** *The Pragmatic Programmer*, Topic 41 (Test to Code); *Working
Effectively with Legacy Code*, ch. 2 (Working with Feedback).

### A8-DEL-02 Deterministic tests

**Rule.** Tests are deterministic, isolated, and independent of execution order.
Control time, randomness, network, and shared state.

**In practice.** Inject a clock and an ID generator. Use a fixed seed for random
tests. Create the data each test needs. Clean up in a way that does not depend on
another test. Do not sleep to wait for an event; await a signal.

**Smell.** A test that fails only on CI. A test that passes alone but fails in a
suite. `setTimeout(..., 1000)` as synchronization. A shared database row mutated
by several tests.

**Source.** *The Pragmatic Programmer*, Topic 42 (Property-Based Testing);
*Working Effectively with Legacy Code*, ch. 18 (My Test Code Is in the Way).

### A8-DEL-03 CI gates

**Rule.** CI runs typecheck, tests, lint, build, and the canon audit. A red gate
blocks merge. Do not merge on a promise to fix it later.

**In practice.** Keep the pipeline fast enough to run on every change. Make
failures explain the rule and the fix. Cache dependencies, not correctness. Run
the full suite on the main branch and the affected suite on pull requests.

**Smell.** A "known failing" test. A lint rule disabled globally. A build that
only works on one laptop. A release that skips the test job.

**Source.** *The Pragmatic Programmer*, Topic 51 (Pragmatic Starter Kit);
*Software Architecture: The Hard Parts*, ch. 1 (Architecture Fitness Functions).

### A8-DEL-04 Small commits

**Rule.** One commit, one intent. The message explains why, not just what. A
reviewer should be able to understand and revert the change without reading the
whole branch.

**In practice.** Separate refactor, feature, dependency, and formatting changes.
Write the subject in the imperative. Put the context, tradeoff, and verification
in the body. Link the issue or ADR.

**Smell.** "fix stuff." A commit with three unrelated features. A rename mixed
with behavior. A revert that cannot be applied cleanly.

**Source.** *The Pragmatic Programmer*, Topic 19 (Version Control); *Working
Effectively with Legacy Code*, ch. 1 (Changing Software).

### A8-DEL-05 Reproducible builds

**Rule.** A clean checkout builds with documented commands and pinned
dependencies. The runtime version is declared. Generated files are either
committed or reproducibly generated.

**In practice.** Commit the lockfile. Pin the Node version. Keep build scripts in
the repository. Document required services and environment variables in
`.env.example`. Test the build in a clean container or CI job.

**Smell.** "Works on my machine." An undeclared global tool. A lockfile that is
not committed. A build step that depends on a local absolute path.

**Source.** *The Pragmatic Programmer*, Topic 51 (Pragmatic Starter Kit) and
Topic 19 (Version Control).

### A8-DEL-06 Automate repetition

**Rule.** If a task is repeated, script it. If a check is manual, automate it when
the cost is lower than the drift it prevents.

**In practice.** Put scripts in the repository with a clear name and `--help`.
Use the same command locally and in CI. Automate formatting, migrations, release
notes, and audits. Keep the script small and testable.

**Smell.** A README with ten manual steps. A release checklist that changes every
time. A audit that only one person knows how to run. Copy-pasted commands in chat.

**Source.** *The Pragmatic Programmer*, ch. 3 (Basic Tools) and Topic 51
(Pragmatic Starter Kit).

### A8-DEL-07 Review for risk, not style

**Rule.** Review in risk order: security and data loss, correctness and
authorization, architecture and coupling, readability, tests and operability.
Leave formatting to the formatter.

**In practice.** Read the diff, then the surrounding code. Verify claims against
the tests. Ask for the smallest safe fix. Distinguish a defect from a preference.
Cite a canon rule when it clarifies the risk.

**Smell.** A review with only nitpicks. A "LGTM" on a large security-sensitive
change. A style debate that blocks a correctness fix. A finding with no evidence.

**Source.** *The Pragmatic Programmer*, ch. 9 (Pragmatic Projects); *A Philosophy
of Software Design*, ch. 16 (Modifying Existing Code).

### A8-DEL-08 Documentation as part of done

**Rule.** A change is not done until the README, ADR, API contract, or runbook
that a future operator needs is updated. Document decisions and operations, not
syntax.

**In practice.** Update the setup steps when dependencies change. Add an ADR for a
hard decision. Document the failure modes and the recovery path. Keep examples
runnable.

**Smell.** A new service with no runbook. An API change with no contract update. A
README that no longer starts the app. An ADR that stops at the decision.

**Source.** *The Pragmatic Programmer*, Topic 45 (The Requirements Pit) and Topic
51 (Pragmatic Starter Kit); *Software Architecture: The Hard Parts*, ch. 1
(Architectural Decision Records).

### A8-DEL-09 Estimate in ranges

**Rule.** Estimate with a range, the assumptions, and the uncertainty. Track the
actual against the estimate and update the model.

**In practice.** Break work into small units with known precedents. Give a
low, likely, and high estimate. Name the biggest unknown. Re-estimate when the
unknown resolves, not only when the deadline slips.

**Smell.** A single-point estimate for novel work. A estimate with no assumptions.
A plan that never changes despite new information. "It will take two days" for a
research task.

**Source.** *The Pragmatic Programmer*, Topic 15 (Estimating).

### A8-DEL-10 Ship, observe, iterate

**Rule.** Ship the smallest useful change, observe it in production, and iterate.
A design that is not observed cannot be validated.

**In practice.** Define the success metric and the failure signal before launch.
Use a feature flag for risky changes. Watch errors, latency, and the business
metric. Remove the flag and the old path once the new path is proven.

**Smell.** A big-bang launch with no metric. A feature flag that lives forever. A
rollback plan that has never been tested. A "done" feature that nobody uses.

**Source.** *The Pragmatic Programmer*, Topic 52 (Delight Your Users); *Designing
Data-Intensive Applications*, ch. 1 (Reliable, Scalable, and Maintainable
Applications).
