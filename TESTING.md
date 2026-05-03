# Testing create-authenik8-app

This project uses two complementary test layers: Vitest for package-level tests and Node's built-in test runner for generated template server smoke tests.

## Quick commands

Install dependencies first:

```bash
npm install
```

Run the full default suite:

```bash
npm test
```

Run tests in watch mode while editing:

```bash
npm run test:watch
```

Run coverage:

```bash
npm run test:coverage
```

Run only the generated-template server checks:

```bash
npm run test:templates
```

## What the template tests verify

`tests/template-servers.test.mjs` copies template server files into temporary projects, installs lightweight local stubs for dependencies such as `express`, `dotenv`, and `authenik8-core`, then imports the server entry points. This keeps the tests fast while still checking that generated server files:

- load with the expected module shape,
- call the Authenik8 initialization path,
- register the expected middleware and safety handlers,
- start through the expected `listen` path, and
- avoid requiring real network services during tests.

## Adding template coverage

When adding or changing a template server file:

1. Add the smallest focused fixture in `tests/template-servers.test.mjs`.
2. Copy the template source into a temporary directory with `writeModule`.
3. Stub only the external modules needed by that template.
4. Import the copied server with `importServer(...)`.
5. Assert on the recorded calls in `globalThis.__templateServerTestState` instead of relying on real services.

Prefer assertions that describe generated-app behavior, not implementation details that are likely to churn.

## Testing interactive CLI changes

For prompt or CLI-flow changes, keep tests deterministic:

- isolate prompt setup from filesystem writes where possible,
- stub prompt answers instead of waiting for real terminal input,
- use temporary directories for generated output,
- assert on files and package scripts created by the CLI, and
- avoid tests that require real databases, Redis, OAuth credentials, or external network calls.

## Debugging failures

If `npm test` fails:

1. Re-run the focused command (`npm run test:templates` for template boot failures, or `npm run test:watch` while iterating on Vitest tests).
2. Check the temporary fixture setup in the failing test; most template failures come from a missing stub or an import path that differs from the generated project layout.
3. Verify that any new template dependency is either intentionally installed by generated apps or stubbed in the test.
4. Keep error messages actionable for contributors who are not familiar with the full template internals.

## Snapshot guidance

If snapshot tests are added later, keep snapshots scoped to stable generated output. Update snapshots only after checking that the generated files still match the intended CLI behavior, and mention the relevant template or prompt change in the pull request.
