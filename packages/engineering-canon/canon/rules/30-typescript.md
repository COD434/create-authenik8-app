# TypeScript

TypeScript is only as strong as the boundaries you give it. These rules keep the
compiler useful instead of decorative, and keep runtime validation where it
belongs.

### A8-TS-01 Strict, no any

**Rule.** Enable `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes`. Do not write `any` in committed code. Use `unknown`
for values you have not validated.

**In practice.** Let the compiler prove the shape. If a library forces `any`,
wrap it once in a typed adapter. Use `unknown` plus a parser or type guard at the
edge. Treat a new `any` as a design smell, not a shortcut.

**Smell.** `: any`, `as any`, `<any>`, `any[]`. A `// @ts-ignore` next to a
complex cast. A public function whose return type is `any`.

**Source.** *Programming TypeScript*, ch. 2-3 (types and type systems);
*Effective TypeScript*, items on `any`, `unknown`, and strictness.

### A8-TS-02 Make illegal states unrepresentable

**Rule.** Model data so invalid combinations cannot be constructed. Prefer
discriminated unions and required fields over booleans and optional fields that
must agree.

**In practice.** Use a `status` discriminant with only the fields valid for that
status. Split a type instead of adding `if (x && !y)` checks everywhere. Make
constructors validate once and return a valid value.

**Smell.** `{ loading: boolean; error?: string; data?: T }` with four impossible
combinations. A boolean flag that changes the meaning of three other fields.
Optional fields that are required in practice.

**Source.** *Effective TypeScript*, item "Prefer Types That Always Represent
Valid States"; *Programming TypeScript*, ch. 6 (Advanced Types).

### A8-TS-03 Parse at the boundary

**Rule.** Treat every external value as `unknown` until a schema or type guard
proves it. Validate shape, type, size, and range at the edge. Inside the
boundary, trust the parsed type.

**In practice.** Use a schema library for HTTP bodies, query strings, env vars,
and third-party responses. Convert to domain types immediately. Do not pass a
`Request`, `Response`, or raw JSON object into the domain.

**Smell.** `JSON.parse(...) as User`. `req.body` used directly. `process.env` read
all over the codebase without validation. A type assertion where a parser should
be.

**Source.** *Effective TypeScript*, item "Use `unknown` Instead of `any` for
Values with an Unknown Type"; *The Pragmatic Programmer*, Topic 23 (Design by
Contract).

### A8-TS-04 Discriminated unions over flags

**Rule.** When a value has variants, use a discriminated union. Do not encode
variants as independent booleans or stringly-typed fields.

**In practice.** Give each variant a literal `kind` or `type` and only the fields
it needs. Switch exhaustively and let the compiler catch a missing case. Put
shared behavior in a function that takes the union.

**Smell.** `type: string` with a comment listing allowed values. Two booleans
that cannot both be true. A `switch` with a `default` that throws for an
impossible case.

**Source.** *Effective TypeScript*, item on discriminated unions;
*Programming TypeScript*, ch. 6 (Advanced Types).

### A8-TS-05 Errors are explicit

**Rule.** Model expected failures as typed results. Use exceptions for programmer
errors and truly exceptional conditions. Never swallow an error without a
documented, non-critical reason (A8-REL-05).

**In practice.** Return a union such as `{ ok: true; value: T } | { ok: false;
error: E }` at boundaries where the caller must decide. Preserve the cause when
rethrowing. Convert unknown thrown values with a small helper before logging.

**Smell.** `catch {}` with no explanation. `catch (e) { console.log(e) }` and
continue. A function that returns `null` for "not found", "forbidden", and
"database down". An error message with no context.

**Source.** *Programming TypeScript*, ch. 7 (Handling Errors); *The Pragmatic
Programmer*, Topic 24 (Dead Programs Tell No Lies).

### A8-TS-06 Casts are debt

**Rule.** Avoid type assertions. A cast tells the compiler to stop checking; it
does not make the value safe. If a cast is unavoidable, isolate it and explain
the invariant that justifies it.

**In practice.** Prefer a type guard, a schema parse, or a typed adapter. Use
`as const` for literals, not for objects with a different shape. Never use
`as unknown as T` to cross a boundary.

**Smell.** `as unknown as`. A cast immediately after `JSON.parse`. A cast that
changes a domain type into a DTO. A comment that says "trust me."

**Source.** *Effective TypeScript*, items on type assertions and type guards;
*Programming TypeScript*, ch. 6 (Advanced Types).

### A8-TS-07 Immutability by default

**Rule.** Mark data `readonly` unless mutation is the point. Avoid shared mutable
state. Return new values instead of modifying inputs.

**In practice.** Use `readonly` arrays and properties on domain types. Copy at
the boundary when accepting caller-owned data. Keep caches and counters behind a
module that owns their synchronization.

**Smell.** A function that sorts its input in place. An exported mutable array. A
module-level `let` used as a cache. Two features mutating the same object.

**Source.** *Effective TypeScript*, items on `readonly` and mutation;
*Programming TypeScript*, ch. 3 (All About Types).

### A8-TS-08 Async discipline

**Rule.** Every promise is awaited, returned, or explicitly handled. Propagate
cancellation. Do not mix callbacks and promises without an adapter.

**In practice.** Use `async`/`await` at the boundary. Return the promise when the
caller should await it. Use `Promise.all` for independent work and
`Promise.allSettled` when partial failure is acceptable. Pass an `AbortSignal`
through I/O.

**Smell.** A floating promise. `forEach(async ...)`. A `try/catch` around a
promise that is not awaited. A timeout that does not cancel the underlying work.

**Source.** *Programming TypeScript*, ch. 8 (Asynchronous Programming); *The
Pragmatic Programmer*, ch. 6 (Concurrency).

### A8-TS-09 Explicit module boundaries

**Rule.** Export the smallest surface that callers need. Do not reach into
another package's `src` or internal file. Use the package entry point or a
documented subpath.

**In practice.** Keep an `index.ts` that exports the public API. Mark internal
modules with a naming convention or a separate folder. Avoid barrel files that
create cycles. If two packages need a shared type, put it in a small contract
package.

**Smell.** `import { x } from "../../other-package/src/internal/x.js"`. A barrel
file that re-exports everything. A package with no clear public API.

**Source.** *Programming TypeScript*, ch. 10 (Namespaces and Modules); *A
Philosophy of Software Design*, ch. 5 (Information Hiding and Leakage).

### A8-TS-10 Type suppressions are bugs

**Rule.** Do not commit `@ts-ignore` or `@ts-nocheck`. If a suppression is truly
unavoidable, use `@ts-expect-error` with a reason and a removal condition.

**In practice.** Fix the type, narrow the input, or wrap the untyped library in
one adapter. If the error is a library bug, pin the version and link the issue in
the comment. Re-check suppressions when dependencies upgrade.

**Smell.** `@ts-ignore` above a line that "works." A file-wide `@ts-nocheck`. A
suppression with no explanation. A suppression that hides a real runtime bug.

**Source.** *Effective TypeScript*, items on type-checking suppression;
*Programming TypeScript*, ch. 2 (TypeScript: A 10,000 Foot View).
