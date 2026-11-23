---
name: TypeScript Craft
description: Write strict TypeScript that makes illegal states unrepresentable, parses at boundaries, and handles errors and async work explicitly
---

# TypeScript Craft

Use when adding types, parsing external data, modeling variants, handling errors,
or reviewing a TypeScript diff. Read `../../canon/rules/30-typescript.md`.

## Workflow

1. **Check the compiler.** `strict`, `noUncheckedIndexedAccess`, and
   `exactOptionalPropertyTypes` are on. If not, fix the config first.
2. **Model the states.** List the valid states and the transitions. Use a
   discriminated union with only the fields each state needs.
3. **Parse the boundary.** Treat `unknown` as the input type. Validate with a
   schema or a type guard. Convert to a domain type before calling the core.
4. **Make errors explicit.** Return a typed result for expected failures. Throw
   for programmer errors. Preserve the cause.
5. **Handle async.** Await or return every promise. Propagate `AbortSignal`.
   Choose `Promise.all` or `Promise.allSettled` deliberately.
6. **Keep modules explicit.** Export the smallest public surface. Do not import
   another package's `src`.
7. **Verify.** Run typecheck, tests, and the canon audit. Remove every new `any`,
   cast, and suppression.

## Patterns

### Discriminated union

```ts
type LoadState<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  | { kind: "failed"; error: AppError };
```

### Boundary parse

```ts
const parsed = CreateOrderSchema.safeParse(input);
if (!parsed.success) return err("invalid_input", parsed.error);
const command: CreateOrder = parsed.data;
```

### Typed result

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

### Type guard

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

## Anti-patterns

- `any`, `as any`, `as unknown as`, `<any>`.
- `@ts-ignore`, `@ts-nocheck`, or `@ts-expect-error` with no reason.
- `JSON.parse(...) as T` without validation.
- Optional fields that must agree with a boolean flag.
- A `switch` with a `default` that throws for an impossible case.
- A floating promise or `forEach(async ...)`.
- A function that mutates its input without saying so.
- A public signature that exposes an ORM entity or vendor SDK type.

## Output contract

1. **Model:** the types and the states they allow.
2. **Boundary:** where parsing happens and what schema is used.
3. **Errors:** the result or exception contract.
4. **Verification:** typecheck, tests, audit.

## Stop conditions

- The only fix is a cast or a suppression.
- The type depends on a runtime value that is not validated.
- The change would widen a public type in a breaking way.
