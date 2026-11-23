---
name: Data Systems
description: Design or review schemas, indexes, transactions, migrations, consistency, and SQL for correctness and operability
---

# Data Systems

Use when adding a table or document, changing a query path, introducing a
transaction, writing a migration, or choosing a consistency model. Read
`../../canon/rules/40-data.md`.

## Workflow

1. **Model the facts.** List the entities, their identity, their invariants, and
   who owns each fact. Name them in the domain language.
2. **List the access patterns.** For each read and write: the key, the filter,
   the sort, the expected volume, and the freshness requirement.
3. **Choose the store.** Relational for invariants and joins; document for
   aggregate-shaped access; key-value for simple lookup; event log for history.
   Do not choose a store before the access patterns.
4. **Define constraints.** Primary keys, foreign keys, uniqueness, nullability,
   checks, and enum values. Enforce invariants in the schema where possible.
5. **Design indexes.** Match the real query order. Measure with `EXPLAIN`.
   Remove unused indexes.
6. **Define transactions.** Which reads and writes must be atomic? What isolation
   level? What anomaly is acceptable? Keep transactions short.
7. **Plan the migration.** Expand, backfill, dual-write/dual-read, contract.
   Test on a production-sized copy. Keep a rollback or a forward fix.
8. **Define consistency and idempotency.** What may be stale? What is the retry
   behavior? What is the dedupe key?
9. **Review the SQL.** Bound parameters, selected columns, pagination, and plan.

## Schema checklist

- Every table has a primary key.
- Every relationship has a foreign key or an explicit equivalent.
- `NOT NULL` unless absence is meaningful.
- Money is integer minor units plus a currency code.
- Timestamps are UTC with an explicit type.
- Enums are constrained, not free text.
- IDs are stable and opaque.
- The same fact has one writer.

## Query checklist

- No `SELECT *` in application code.
- No SQL interpolation or concatenation.
- Composite indexes match equality, then range, then sort.
- Large or changing sets use keyset pagination, not `OFFSET`.
- `EXPLAIN` shows an index for the hot path.
- The query does not load an unbounded graph.

## Migration checklist

- Additive first: nullable column or new table.
- Backfill in bounded batches.
- Dual-write or dual-read during the transition.
- Old shape removed only after every reader moves.
- Tested on a production-sized copy.
- Backup and restore path verified.
- No long table lock in the deploy window.

## Output contract

1. **Model:** entities, owners, invariants.
2. **Access patterns:** key, filter, sort, volume, freshness.
3. **Schema and indexes:** the DDL and the reason for each index.
4. **Transactions:** boundary, isolation, and the anomaly accepted.
5. **Migration:** steps, backfill, rollback.
6. **Risks:** scale, consistency, and operational unknowns.

## Stop conditions

- Two writers would own the same fact.
- A migration rewrites a large table under a lock with no plan.
- The query needs an unbounded scan on a hot path.
- The consistency requirement is unknown and the user cannot clarify it.
