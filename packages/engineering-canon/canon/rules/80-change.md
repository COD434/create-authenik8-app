# Change

Most code is changed, not written from scratch. The safe change is small,
observed, and reversible. These rules apply to legacy code, inherited services,
and any feature added under time pressure.

### A8-CHG-01 Pin behavior first

**Rule.** Before changing existing behavior, write tests that describe the
behavior you must preserve. Characterization tests may assert current quirks;
that is the point.

**In practice.** Find the smallest observable surface. Capture inputs, outputs,
side effects, and error cases. Run the tests before and after the change. If the
current behavior is wrong, record the intended change in a separate commit.

**Smell.** A refactor with no tests. "It should still work." A change that
silently alters an error message or status code. Tests that only cover the new
path.

**Source.** *Working Effectively with Legacy Code*, ch. 2 (Working with Feedback)
and ch. 13 (I Need to Make a Change but I Don't Know What Tests to Write).

### A8-CHG-02 Find the seam

**Rule.** A seam is a place where you can change behavior without editing the
code in place. Introduce a seam at the dependency that blocks testing, not at
every dependency.

**In practice.** Prefer a constructor parameter, a function argument, or a small
adapter. Keep the production wiring in one composition root. Do not add a
framework or a global registry when a parameter will do.

**Smell.** A static call to a clock, network, or database in the middle of a
method. A test that needs the real external service. A seam that leaks a test-only
type into production.

**Source.** *Working Effectively with Legacy Code*, ch. 4 (The Seam Model).

### A8-CHG-03 Sense and separate

**Rule.** Separate the code that senses a result from the code that decides what
to do with it. Tests should be able to observe the decision without the real
dependency.

**In practice.** Extract a pure calculation from the I/O. Return a value instead
of writing it directly. Inject a fake at the boundary when the real dependency is
slow, nondeterministic, or unavailable.

**Smell.** A method that both queries the database and formats the response. A
test that asserts on a log line because there is no return value. A fake that
reimplements the production algorithm.

**Source.** *Working Effectively with Legacy Code*, ch. 3 (Sensing and
Separation).

### A8-CHG-04 Small, reversible steps

**Rule.** Change one behavior at a time. Keep each step small enough to review,
test, and revert. Do not combine a refactor, a dependency upgrade, and a feature
in one change.

**In practice.** Use a branch per concern. Commit in a sequence a reviewer can
follow. Keep the old path working until the new path is verified. Prefer a flag
or an adapter over a big-bang cutover.

**Smell.** A pull request with 60 files and three unrelated goals. A rewrite that
cannot be partially shipped. A rollback that requires another migration. A "quick
fix" mixed with formatting churn.

**Source.** *Working Effectively with Legacy Code*, ch. 1 (Changing Software) and
ch. 6 (I Don't Have Much Time and I Have to Change It); *The Pragmatic
Programmer*, Topic 40 (Refactoring).

### A8-CHG-05 Refactor separately

**Rule.** Refactoring changes structure without changing behavior. Do it under
green tests, in its own commits, separate from behavior changes.

**In practice.** Rename, extract, and move with tests passing at every step. If a
refactor reveals a bug, stop and record it; fix it in a separate change with its
own test. Do not "clean up" while implementing a feature.

**Smell.** A commit that renames a module and changes its behavior. A refactor
with no tests. A formatting-only change mixed with logic. A "small cleanup" that
turns into a rewrite.

**Source.** *Working Effectively with Legacy Code*, ch. 1 (Changing Software);
*The Pragmatic Programmer*, Topic 40 (Refactoring).

### A8-CHG-06 Understand before changing

**Rule.** Read the callers, the tests, and the history before editing. If you
cannot explain the current behavior, you are not ready to change it.

**In practice.** Trace one real input through the code. Read the tests that
already exist. Check the last few changes to the area. Write a short note about
what you learned and what remains uncertain.

**Smell.** A change based only on the function name. A "dead" function that is
called dynamically. A test suite that nobody runs. A history of repeated fixes in
the same spot.

**Source.** *Working Effectively with Legacy Code*, ch. 16 (I Don't Understand the
Code Well Enough to Change It) and ch. 17 (My Application Has No Structure).

### A8-CHG-07 Adapters over mock sprawl

**Rule.** Wrap an awkward dependency in a small adapter that expresses what the
domain needs. Mock the adapter, not every low-level call.

**In practice.** Define the interface in domain terms: `chargeCard`, `sendEmail`,
`readFile`. Implement it with the vendor SDK in one place. Use a fake for tests.
Keep vendor types out of the domain.

**Smell.** Tests with five mocks for one operation. A mock that asserts the exact
call sequence of a library. Vendor SDK types in domain signatures. A fake that
drifts from the real adapter.

**Source.** *Working Effectively with Legacy Code*, ch. 9-14 (test harnesses and
library dependencies) and ch. 25 (Dependency-Breaking Techniques).

### A8-CHG-08 Preserve contracts

**Rule.** Treat public functions, HTTP endpoints, events, and database columns as
contracts. Change them additively, version them, and deprecate explicitly.

**In practice.** Add a field before requiring it. Keep the old path until consumers
migrate. Publish a deprecation date and a replacement. Test the contract from the
consumer's perspective.

**Smell.** A field removed with no notice. A response shape changed silently. An
event payload whose meaning shifts. A database column reused for a new purpose.

**Source.** *Working Effectively with Legacy Code*, ch. 8 (How Do I Add a
Feature?); *Designing Data-Intensive Applications*, ch. 4 (Encoding and
Evolution).

### A8-CHG-09 Every bug fix leaves a test

**Rule.** Reproduce the bug in a failing test before fixing it. Keep the test
after the fix. The test should fail for the original reason, not just exercise
the new code.

**In practice.** Write the smallest input that triggers the bug. Assert the
correct behavior, not the implementation detail. If the bug is environmental,
document the setup in the test. Link the issue in the commit message.

**Smell.** A fix with no regression test. A test that passes before the fix. A
test that asserts a log line instead of behavior. A bug that reappears in a
different form.

**Source.** *Working Effectively with Legacy Code*, ch. 13 (I Need to Make a
Change but I Don't Know What Tests to Write); *The Pragmatic Programmer*, Topic
41 (Test to Code).
