---
name: Readability Craft
description: Write or refactor code for readability using precise names, small units, flat control flow, useful comments, cohesive files, and obvious behavior
---

# Readability Craft

Use when writing new production code, refactoring a hard-to-read module, or
reviewing a diff for clarity. Read `../../canon/rules/20-readability.md`.

## Workflow

1. **Read it aloud.** If you cannot explain the function in one sentence, its
   responsibility is unclear. Write the sentence down; use it as the name or the
   comment.
2. **Name the concepts.** Replace vague nouns (`data`, `manager`, `helper`,
   `utils`) and abbreviations. Use the domain's language consistently. A boolean
   reads as a predicate; a function reads as a verb phrase.
3. **Shrink the unit.** Target 40 lines per function. Extract named steps at one
   level of abstraction. If a block needs a banner comment, it is a function.
4. **Flatten the flow.** Handle invalid cases first and return. Remove `else`
   after a `return`. Replace a chain of `if` on one value with a `switch` or a
   lookup table. More than three nested control levels is a smell.
5. **Separate policy from mechanism.** Move HTTP, SQL, and framework types out of
   the decision core. Keep a pure core and a thin imperative shell.
6. **Comment the why.** Add intent, invariants, units, ordering, and workarounds.
   Delete comments that restate the syntax. Update comments with the code.
7. **Remove dead weight.** Delete unused code, commented-out code, stale TODOs,
   and misleading names. Version control remembers.
8. **Verify.** Run the tests and the canon audit. Re-read the diff as a reviewer.

## Refactor recipes

- **Extract function:** a block with a comment banner becomes a named function.
- **Guard clause:** invert a nested condition and return early.
- **Introduce parameter object:** several same-typed positional arguments become
  a named type.
- **Replace boolean flag:** two behaviors become a discriminated union or two
  functions.
- **Split phase:** parsing, validation, decision, and rendering become separate
  steps with explicit data.
- **Move to the owner:** a helper used by one module moves into that module.
- **Inline a shallow wrapper:** a one-line pass-through method disappears.

## Review checklist

- Names are precise and consistent with the domain.
- Functions do one thing and fit on a screen.
- Nesting is shallow and the happy path is obvious.
- Errors are handled at the layer that can decide.
- Comments explain why, not what.
- No dead code or commented-out code.
- The file has one primary reason to change.
- The diff does not mix refactoring with behavior change.

## Output contract

When editing, return the patch and a short note: what became clearer, what
behavior is unchanged, and which tests prove it.

When reviewing, return findings in severity order with rule IDs, file and line,
evidence, impact, and the smallest safe fix. Do not report formatting preferences
as defects.

## Stop conditions

- The refactor would change behavior without a test.
- The code is generated or vendored and should not be hand-edited.
- The readability fix requires a public API change with no migration path.
