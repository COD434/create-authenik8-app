# Architecture

Architecture is the set of decisions that are expensive to reverse: boundaries,
data ownership, communication paths, and the contracts other teams depend on.
The goal is not a diagram. The goal is a system whose next change is local.

### A8-ARCH-01 Boundaries follow change and ownership

**Rule.** Draw boundaries around a coherent model and the team that owns it, not
around technical layers. A boundary should reduce the number of people and
concepts a change must touch.

**In practice.** Map the domain first: subdomains, their language, and who owns
each decision. Put a boundary where the meaning of a term changes. Keep one
writer per business fact. If two areas must change together for every feature,
the boundary is probably wrong.

**Smell.** A "services" folder organized only by `controllers`, `models`, and
`repositories`. The same business rule implemented in three contexts. A boundary
that exists only to match an org chart.

**Source.** *Domain-Driven Design Distilled*, ch. 2 (Bounded Contexts and the
Ubiquitous Language) and ch. 3 (Subdomains); *Software Architecture: The Hard
Parts*, ch. 3 (Architectural Modularity).

### A8-ARCH-02 Deep modules

**Rule.** A module should have a small interface and a substantial
implementation. The caller should get real capability without learning the
module's internals.

**In practice.** Count the concepts a caller must know. If the interface exposes
caching, retries, storage layout, or vendor objects, hide them. Move orchestration
inside the module. A good module can be described in one sentence and used
without reading its source.

**Smell.** A wrapper with one-line methods that just forward arguments. A caller
that must call three methods in the right order. A "service" that is mostly a
pass-through to a repository.

**Source.** *A Philosophy of Software Design*, ch. 4 (Deep Modules) and ch. 7
(Different Layer, Different Abstraction).

### A8-ARCH-03 Information hiding

**Rule.** Hide design decisions that are likely to change. A module's interface
should not leak its storage format, transport, framework, or vendor.

**In practice.** Keep database rows, HTTP DTOs, and domain objects distinct at the
boundary. Return domain values, not ORM entities or `Response` objects. If a
caller can observe how you store data, every storage change becomes a public API
change.

**Smell.** A function named `getUserRow` returning a database record. A domain
type with `createdAt` and `updatedAt` columns leaking into the UI. A vendor SDK
type in a public signature.

**Source.** *A Philosophy of Software Design*, ch. 5 (Information Hiding and
Leakage); *Domain-Driven Design Distilled*, ch. 2 (Bounded Contexts).

### A8-ARCH-04 One layer, one abstraction

**Rule.** Each layer should add a distinct abstraction. Adjacent layers should
not expose the same concepts in the same shape.

**In practice.** A controller translates HTTP to an application call. The
application layer coordinates a use case. The domain layer enforces invariants.
The repository layer persists. If two layers have the same method names and
arguments, one of them is probably unnecessary.

**Smell.** A controller that calls a service that calls a repository that calls
an ORM, with identical signatures at every step. Pass-through methods. A
"manager" layer with no decisions.

**Source.** *A Philosophy of Software Design*, ch. 7 (Different Layer, Different
Abstraction); *The Pragmatic Programmer*, Topic 10 (Orthogonality).

### A8-ARCH-05 Pull complexity downward

**Rule.** When a module can absorb complexity so its callers do not have to, it
should. Callers should get a simple contract, even if the implementation is
harder.

**In practice.** Handle retries, normalization, defaults, and edge cases inside
the module. Do not make every caller remember the same three-step dance. If the
module cannot decide, return a clear result and let the caller choose policy.

**Smell.** Every caller repeats the same validation, retry, or cleanup. The
module's README is longer than its interface. A caller must know which errors are
"expected."

**Source.** *A Philosophy of Software Design*, ch. 8 (Pull Complexity Downward).

### A8-ARCH-06 Better together or better apart

**Rule.** Put code together when it shares knowledge or changes together. Split
it when it has independent reasons to change or when the combination creates
information leakage.

**In practice.** Use change coupling as evidence, not file proximity. If a
feature consistently edits the same two modules, consider merging them. If a
module has two audiences that change on different schedules, split it.

**Smell.** A "utils" module that every feature edits. A split that forces every
feature to change both sides. A merge that makes unrelated changes collide.

**Source.** *A Philosophy of Software Design*, ch. 9 (Better Together Or Better
Apart); *The Pragmatic Programmer*, Topic 9 (DRY).

### A8-ARCH-07 Coupling and connascence

**Rule.** Measure coupling by what must change together, not by how many imports
exist. Prefer weaker forms: name, type, meaning, position, algorithm, and timing,
in roughly that order of increasing strength.

**In practice.** A shared type is weaker than a shared timestamp format. A shared
timestamp format is weaker than a shared ordering of positional arguments. A
shared ordering is weaker than a shared algorithm. Replace strong coupling with a
narrow contract, a named type, or an explicit event.

**Smell.** Positional arguments with several same-typed parameters. Two modules
that must deploy together. A change to a field order breaking a consumer. A
shared database schema used as an integration contract.

**Source.** *Software Architecture: The Hard Parts*, ch. 2 (Discerning Coupling
in Software Architecture); *A Philosophy of Software Design*, ch. 5 (Information
Hiding and Leakage).

### A8-ARCH-08 Aggregates are transaction boundaries

**Rule.** An aggregate is a consistency boundary. One transaction should modify
one aggregate. Reference other aggregates by identity, not by object graph.

**In practice.** Put the invariants that must be true immediately inside one
aggregate. Use domain events or sagas for cross-aggregate consistency. Do not
load a large object graph just to change one child. Keep aggregate roots small.

**Smell.** A transaction that updates five tables owned by different concepts. A
"save everything" method. Lazy loading across aggregate boundaries. Two teams
editing the same aggregate for unrelated reasons.

**Source.** *Domain-Driven Design Distilled*, ch. 5 (Tactical Design with
Aggregates); *Software Architecture: The Hard Parts*, ch. 9 (Data Ownership and
Distributed Transactions).

### A8-ARCH-09 Explicit context maps

**Rule.** When two bounded contexts interact, make the relationship explicit:
partnership, customer-supplier, conformist, anti-corruption layer, or separate
ways. Do not let one model silently become the other's model.

**In practice.** Draw the map. Name the upstream and downstream. Put translation
in an anti-corruption layer at the boundary. Version public contracts. Record
what each side owns.

**Smell.** Shared "common" domain models across contexts. One context reading
another's tables. A downstream team forced to adopt upstream terminology
without translation.

**Source.** *Domain-Driven Design Distilled*, ch. 4 (Strategic Design with
Context Mapping); *Software Architecture: The Hard Parts*, ch. 13 (Contracts).

### A8-ARCH-10 Record hard decisions in ADRs

**Rule.** Every decision that is expensive to reverse gets a short Architecture
Decision Record: context, alternatives, decision, and consequences.

**In practice.** Store ADRs beside the code. Keep them to one or two pages. List
the alternatives you rejected and why. Include the exit condition: what evidence
would make you revisit the decision. Link the ADR from the pull request.

**Smell.** A boundary chosen in a meeting with no record. A decision that is
re-litigated every quarter. An ADR that lists only the chosen option.

**Source.** *Software Architecture: The Hard Parts*, ch. 1 (Architectural
Decision Records); *The Pragmatic Programmer*, Topic 11 (Reversibility).

### A8-ARCH-11 Automate architecture with fitness functions

**Rule.** If an architecture characteristic matters, encode a fitness function
that checks it. A rule that is not checked will decay.

**In practice.** Start with the cheap, deterministic checks: import cycles,
forbidden dependencies, bundle size, response-time budgets, schema compatibility,
and secret scans. Run them in CI. Make failures explain the rule and the fix.

**Smell.** An architecture diagram that nobody verifies. A "layering" rule
enforced only in review. A performance target with no measurement.

**Source.** *Software Architecture: The Hard Parts*, ch. 1 (Architecture Fitness
Functions); *The Pragmatic Programmer*, Topic 51 (Pragmatic Starter Kit).

### A8-ARCH-12 Keep dependencies acyclic

**Rule.** Module dependencies must form a directed acyclic graph. A cycle means
two modules are really one module, or a shared abstraction is missing.

**In practice.** Run a cycle check in CI. When a cycle appears, move the shared
concept into a third module, invert one dependency with an interface, or merge
the modules if they change together. Do not "fix" a cycle with a dynamic import.

**Smell.** `a` imports `b`, `b` imports `a`. A cycle hidden behind a barrel file.
A type-only cycle that still couples the build.

**Source.** *A Philosophy of Software Design*, ch. 9 (Better Together Or Better
Apart); *Software Architecture: The Hard Parts*, ch. 3 (Architectural
Modularity).

### A8-ARCH-13 Prefer a modular monolith first

**Rule.** Start with one deployable and strong internal boundaries. Split into
services only when independent deployment, scaling, or ownership justifies the
operational cost.

**In practice.** Make modules independent in code first: separate data ownership,
explicit contracts, no cross-module table access. Measure the force that wants a
split. If you cannot name it, stay a monolith.

**Smell.** Microservices with a shared database. A distributed monolith where
every feature deploys three services together. Service boundaries copied from
layers rather than domains.

**Source.** *Software Architecture: The Hard Parts*, ch. 3 (Architectural
Modularity) and ch. 7 (Service Granularity); *Domain-Driven Design Distilled*,
ch. 2 (Bounded Contexts).

### A8-ARCH-14 Define errors out of existence

**Rule.** Prefer an interface where the error cannot occur. If a failure is
normal, model it as a result. If it is a bug, fail loudly. Do not make every
caller handle every edge case.

**In practice.** Normalize inputs at the boundary. Make invalid states
unrepresentable. Return `null` only when absence is meaningful. Use a typed
result for expected failures and exceptions for programmer errors. Handle the
error once, at the layer that can decide.

**Smell.** A function that returns `undefined` for six different reasons. Every
caller writes the same `if (!x) return`. A thrown exception used for ordinary
control flow.

**Source.** *A Philosophy of Software Design*, ch. 10 (Define Errors Out of
Existence); *Effective TypeScript*, item on preferring types that represent
valid states.
