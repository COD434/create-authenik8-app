---
name: Architecture Design
description: Design or restructure a system boundary, module, data ownership model, or cross-cutting flow using deep modules, explicit contracts, ADRs, and fitness functions
---

# Architecture Design

Use when a change is expensive to reverse: a new service or module, a boundary
move, a data ownership change, an auth flow, or a cross-cutting concern.

Read `../../canon/rules/10-architecture.md` and the relevant parts of
`../../canon/CANON.md`.

## Inputs

- The user outcome and the constraints that matter (latency, cost, team, deadline).
- The current boundaries and who owns each fact.
- The failure modes and the trust boundaries.
- The change that is most likely next.

If the outcome or the owner is unclear, stop and ask one blocking question. Do
not invent a domain model from a feature list.

## Workflow

1. **Frame the forces.** Write one paragraph: the outcome, the constraints, the
   quality attributes, and the risk. Name what is *not* in scope.
2. **Map the domain.** List the bounded contexts, their language, and the fact
   each one owns. Mark where a term changes meaning. Mark the trust boundaries.
3. **Find the change axis.** Ask what changes most often and what must stay
   stable. A boundary that does not reduce change cost is probably a layer.
4. **Design twice.** Sketch two credible options. For each, list the interface,
   the data owner, the failure path, and the operational cost. Do not let the
   first sketch become the only sketch.
5. **Choose and record.** Write an ADR with context, alternatives, decision, and
   consequences. Include the exit condition: what evidence would reopen it.
6. **Specify the contract.** For each module, write the smallest public surface:
   inputs, outputs, errors, invariants, and what is hidden. If a caller must know
   storage, transport, or vendor details, the boundary is leaking.
7. **Define fitness functions.** Add at least one deterministic check: import
   cycles, forbidden dependency, contract test, latency budget, or schema
   compatibility.
8. **Slice vertically.** Build one thin end-to-end path before breadth. Prove the
   boundary with a real caller, not a diagram.
9. **Review.** Run the canon audit and the architecture reviewer. Fix high and
   critical findings before expanding.

## Design-twice template

```text
Option A:
  boundary:
  data owner:
  public interface:
  failure path:
  operational cost:
  what changes cheaply:
  what becomes hard:

Option B:
  ...

Decision:
Why:
Consequences:
Revisit if:
```

## ADR template

```md
# ADR-0001: <short noun phrase>

## Context
The forces, constraints, and alternatives considered.

## Decision
The choice, in one paragraph.

## Consequences
What becomes easier, what becomes harder, and what we accept.

## Revisit if
The evidence or condition that would reopen this decision.
```

## Boundary checklist

- One writer per business fact.
- No shared database table across contexts.
- Cross-context calls go through an explicit contract or an anti-corruption layer.
- Aggregates are small and transactional; cross-aggregate work uses events or a saga.
- Dependencies are acyclic.
- Errors are defined at the boundary, not leaked from storage or transport.
- The module can be tested without the real vendor or network.

## Output contract

Return:

1. **Decision:** the chosen boundary and why.
2. **Map:** contexts, owners, and trust boundaries.
3. **Contracts:** public interfaces and invariants.
4. **ADR path:** where the record lives.
5. **Fitness functions:** the checks added.
6. **Risks:** what is still uncertain and what would change the decision.

## Stop conditions

- The boundary would require a distributed transaction with no saga or
  compensation plan.
- Two contexts would write the same fact.
- The only way to meet the requirement is a shared database across services.
- The design depends on a client-side authorization check.
- The migration is destructive with no backup or rollback.
