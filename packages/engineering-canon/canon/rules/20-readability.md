# Readability

Readable code is not shorter code. It is code where the next engineer can see
what is happening, why it is happening, and what must remain true. These rules
apply to production code, tests, scripts, and generated examples.

### A8-READ-01 Small, single-purpose units

**Rule.** A function should do one thing at one level of abstraction. Target 40
lines or fewer; treat 60 as a warning and 100 as a defect. A file should have one
primary reason to change.

**In practice.** Extract named steps. If a function needs a paragraph to explain
its sections, those sections are functions. Keep the public entry point short and
push detail into helpers with intention-revealing names.

**Smell.** A function with "and" in its name. A file with several unrelated
exports. A block that needs a comment banner every ten lines.

**Source.** *A Philosophy of Software Design*, ch. 9 (Better Together Or Better
Apart); *The C Programming Language*, ch. 4 (Functions and Program Structure).

### A8-READ-02 Flatten control flow

**Rule.** Keep control flow shallow. Prefer guard clauses and early returns over
nested conditionals. More than three levels of nesting is a design smell.

**In practice.** Handle invalid cases first and return. Invert negative
conditions. Extract the body of a loop or branch into a named function. Use a
`switch` or a lookup table instead of a chain of `if` statements on the same
value.

**Smell.** The "arrow" shape. An `else` after a `return`. Deeply nested
callbacks. A loop whose body is another loop whose body is a conditional.

**Source.** *The C Programming Language*, ch. 3 (Control Flow); *A Philosophy of
Software Design*, ch. 18 (Code Should be Obvious).

### A8-READ-03 Precise names

**Rule.** Names should say what a thing is or does, in the domain's language.
Avoid abbreviations, single letters, and vague nouns such as `data`, `manager`,
`helper`, `utils`, or `handle`.

**In practice.** Use the same word for the same concept everywhere. A boolean
reads as a predicate (`isExpired`, `canRetry`). A function reads as a verb
phrase. A type reads as a noun. If a name is hard to choose, the concept is
probably unclear.

**Smell.** `doStuff`, `processData`, `tmp`, `x`, `flag`. Two names for one
concept. A name that lies about side effects.

**Source.** *A Philosophy of Software Design*, ch. 14 (Choosing Names); *The
Pragmatic Programmer*, Topic 44 (Naming Things).

### A8-READ-04 Comments add missing context

**Rule.** Comment what the code cannot say: intent, invariants, tradeoffs,
surprising constraints, and links to decisions. Do not restate the syntax.

**In practice.** Put a short "why" above a non-obvious block. Document units,
ranges, ownership, and ordering. Explain a workaround and when it can be removed.
Keep comments next to the code they describe and update them with the code.

**Smell.** `// increment i` above `i++`. A comment that contradicts the code. A
large block comment describing an interface that the types already express. A
`TODO` with no owner or condition.

**Source.** *A Philosophy of Software Design*, ch. 12 (Why Write Comments?) and
ch. 13 (Comments Describe What Is Not Obvious).

### A8-READ-05 Obvious code

**Rule.** Code should be obvious to a reader who knows the language but not this
module. Avoid hidden side effects, action at a distance, and clever tricks.

**In practice.** Make inputs and outputs explicit. Do not mutate a parameter
unless the name says so. Avoid global state. Prefer a named intermediate value
over a dense expression. If a reader has to simulate the code to understand it,
simplify it.

**Smell.** A getter that writes. A function that changes a global. A one-liner
with three nested ternaries. A macro or metaprogram that hides control flow.

**Source.** *A Philosophy of Software Design*, ch. 18 (Code Should be Obvious);
*The Pragmatic Programmer*, Topic 38 (Programming by Coincidence).

### A8-READ-06 Consistency

**Rule.** Use one way to do one thing. Follow the local convention unless it is
actively harmful; if you change it, change it everywhere and record why.

**In practice.** Match naming, error handling, file layout, and test style to the
surrounding code. Put shared conventions in one place. Do not introduce a second
HTTP client, date library, or validation style for a small feature.

**Smell.** Two patterns for the same job in adjacent files. A new utility that
duplicates an existing one with a different name. Inconsistent error shapes.

**Source.** *A Philosophy of Software Design*, ch. 17 (Consistency); *The
Pragmatic Programmer*, Topic 10 (Orthogonality).

### A8-READ-07 Organize by knowledge, not time

**Rule.** Structure code by the knowledge it owns, not by the order in which
steps happen to execute. Temporal decomposition scatters one decision across
many modules.

**In practice.** Group the validation, policy, and persistence for one concept
together. A use-case function may read top to bottom, but the modules it calls
should be organized by responsibility. Do not create `parse`, `validate`, and
`save` modules that only one feature uses in a fixed sequence.

**Smell.** A pipeline of tiny modules with no other callers. A change to one
business rule requiring edits in five sequential files. A folder named after the
order of a request.

**Source.** *A Philosophy of Software Design*, ch. 5 (Information Hiding and
Leakage) and ch. 9 (Better Together Or Better Apart).

### A8-READ-08 Separate policy from mechanism

**Rule.** Keep business policy independent of the mechanism that carries it.
Policy says what must happen; mechanism says how it is transported or stored.

**In practice.** Put domain decisions in plain functions or objects with no HTTP,
SQL, or framework types. Adapt at the edges. A policy change should not require a
controller change; a transport change should not require a domain change.

**Smell.** Business rules inside a route handler. SQL inside a React component.
A domain function that takes a `Request` or returns a `Response`.

**Source.** *A Philosophy of Software Design*, ch. 6 (General-Purpose Modules are
Deeper); *The Pragmatic Programmer*, Topic 10 (Orthogonality).

### A8-READ-09 Pure core, imperative shell

**Rule.** Keep the decision-making core pure: same inputs, same outputs, no I/O.
Push effects to a thin shell that reads input, calls the core, and writes output.

**In practice.** Pass data in, return data out. Inject clocks, ID generators, and
repositories at the shell. Test the core without mocks. Keep the shell small
enough to review by inspection.

**Smell.** A "domain" function that reads `process.env`, calls `fetch`, or writes
to the database. Tests that need a running server to check a rule. Time-dependent
assertions.

**Source.** *Structure and Interpretation of Computer Programs*, ch. 1-3
(abstraction and modularity); *The Pragmatic Programmer*, Topic 30 (Transforming
Programming).

### A8-READ-10 Errors are part of the interface

**Rule.** An error message should say what failed, why, and what the caller can
do next. Do not leak stack traces, secrets, or internal identifiers to users.

**In practice.** Use a stable error code for machines and a clear sentence for
humans. Include the field or operation that failed. Log the technical detail
server-side with a correlation ID; return the safe summary to the client.

**Smell.** `Error: something went wrong`. A raw database error returned to the
browser. An error that says "invalid" without naming the field. A caught error
that is logged and ignored.

**Source.** *A Philosophy of Software Design*, ch. 10 (Define Errors Out of
Existence); *The Pragmatic Programmer*, Topic 24 (Dead Programs Tell No Lies).

### A8-READ-11 No dead weight

**Rule.** Delete dead code, commented-out code, unused exports, and stale
comments. Version control remembers; the reader should not have to guess what is
still alive.

**In practice.** Remove code in the same change that makes it unused. If a
feature is behind a flag, document the flag and the removal condition. Do not
keep a "backup" implementation in a comment.

**Smell.** `// old implementation` blocks. Unused parameters kept "for
compatibility." A file with exports nobody imports. A comment that describes a
previous design.

**Source.** *The Pragmatic Programmer*, Topic 3 (Software Entropy) and Topic 40
(Refactoring); *A Philosophy of Software Design*, ch. 16 (Modifying Existing
Code).
