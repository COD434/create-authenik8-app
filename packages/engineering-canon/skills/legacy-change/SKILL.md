---
name: Legacy Change
description: Make a safe change to unfamiliar or legacy code using characterization tests, seams, adapters, and small reversible steps
---

# Legacy Change

Use when the code has no tests, the behavior is unclear, or a change must land in
a module nobody wants to touch. Read `../../canon/rules/80-change.md`.

## Workflow

1. **Reproduce.** Write the smallest input that reaches the code. Observe the
   current output, side effects, and errors. Do not change anything yet.
2. **Pin behavior.** Add characterization tests around the behavior you must
   preserve. Assert what the code does now, including quirks. Run them green.
3. **Find the seam.** Identify the dependency that blocks testing: clock,
   network, database, filesystem, random, global. Introduce one seam at that
   dependency. Prefer a parameter or a small adapter over a framework.
4. **Separate sensing from deciding.** Extract the calculation from the I/O.
   Return a value instead of writing it. Inject a fake at the seam.
5. **Write the failing test.** For a bug, reproduce it. For a feature, describe
   the new behavior. The test must fail for the right reason.
6. **Make the smallest change.** One behavior at a time. Do not refactor and
   change behavior in the same commit.
7. **Refactor under green.** Rename, extract, and move with tests passing at each
   step. Keep the public contract until consumers migrate.
8. **Verify.** Run the characterization tests, the new tests, the typecheck, and
   the canon audit. Check the old path and the new path.

## Seam patterns

- **Parameterize:** pass the clock, ID generator, or client as an argument.
- **Extract interface:** define the domain operation (`chargeCard`) and adapt the
  vendor SDK in one place.
- **Sprout:** add the new behavior in a new function or class, call it from the
  old code, and leave the old path intact.
- **Wrap:** put a narrow adapter around a static or global call.
- **Extract and override:** pull the hard-coded dependency into a protected
  method, then override it in a test subclass.
- **Introduce a composition root:** wire real dependencies at the edge, keep the
  core constructor-injected.

## Monster method

1. Identify the inputs, outputs, and side effects.
2. Add characterization tests for the paths you can reach.
3. Extract one cohesive block at a time, keeping behavior identical.
4. Name the extracted step after its purpose, not its position.
5. Repeat until the method reads as a sequence of named decisions.
6. Only then change behavior.

## Rules

- No behavior change without a test.
- No refactor mixed with a feature.
- No mock sprawl: mock the adapter, not every library call.
- No public contract change without a deprecation path.
- No "temporary" skip or disabled test left behind.

## Output contract

1. **Current behavior:** what the characterization tests pin.
2. **Seam:** where the dependency was broken and why.
3. **Change:** the smallest behavior change.
4. **Tests:** the failing test, the characterization tests, and the verification.
5. **Residual risk:** paths you could not reach.

## Stop conditions

- The code cannot be exercised at all without a production dependency.
- The only seam would leak a test-only type into production.
- The change requires a destructive migration with no backup.
- The behavior is unknown and the owner cannot clarify it.
