# Data

Data outlives code. A schema, an index, or a transaction boundary is a promise
to every future reader and writer. These rules apply to relational databases,
document stores, caches, and event logs.

### A8-DATA-01 Model the domain, not the screen

**Rule.** Start from the business facts and invariants, not from the current UI.
A table or document should represent a concept with a stable identity and rules.

**In practice.** Name entities in the domain language. Put invariants in
constraints or in the aggregate that owns them. Let the UI project a view; do not
shape storage around one page. If two screens need different shapes, derive
read models instead of duplicating writes.

**Smell.** Tables named after pages or components. A `json` column holding the
whole form. Fields that only one screen uses. The same fact stored in three
places with no owner.

**Source.** *Domain-Driven Design Distilled*, ch. 2 (Bounded Contexts) and ch. 5
(Aggregates); *Designing Data-Intensive Applications*, ch. 2 (Data Models and
Query Languages).

### A8-DATA-02 Normalize, then document denormalization

**Rule.** Normalize until each fact has one owner. Denormalize only for a measured
read path, and document the source of truth and the refresh rule.

**In practice.** Keep transactional writes normalized. Add derived tables,
materialized views, or caches for reads. Record how the derived copy is updated,
how stale it may be, and how it is rebuilt. Never let two copies accept writes.

**Smell.** The same field updated by three services. A cache with no invalidation
story. A denormalized column with no documented owner. A report that disagrees
with the source table.

**Source.** *Learning SQL*, ch. 2 (Creating and Populating a Database); *Designing
Data-Intensive Applications*, ch. 2 (Data Models and Query Languages).

### A8-DATA-03 Keys and constraints

**Rule.** Every table has a primary key. Every relationship has a foreign key or
an explicit equivalent. Enforce uniqueness, nullability, and range in the schema.

**In practice.** Prefer stable surrogate keys for identity and natural keys for
uniqueness. Use `NOT NULL` unless absence is meaningful. Add `CHECK` constraints
for invariants the database can enforce. Do not rely on application code as the
only guard.

**Smell.** A table without a primary key. A foreign key that exists only in
comments. Nullable columns that are always written. Duplicate rows that differ
only by timestamp.

**Source.** *Learning SQL*, ch. 13 (Indexes and Constraints); *Database
Internals*, ch. 2 (B-Tree Basics).

### A8-DATA-04 Index real access paths

**Rule.** Index the columns used by real queries, in the order the query uses
them. Measure with `EXPLAIN`; do not index speculatively.

**In practice.** Match composite index order to equality columns first, then
range or sort columns. Cover the columns a hot query needs when the read volume
justifies it. Remove unused indexes; they cost writes and space. Re-check plans
after data growth.

**Smell.** An index on every column. A composite index in the wrong order. A
query that scans a large table on every request. An index added "just in case."

**Source.** *Learning SQL*, ch. 13 (Indexes and Constraints); *Database
Internals*, ch. 2-3 (B-Tree Basics and File Formats).

### A8-DATA-05 Transactions and isolation

**Rule.** Know the isolation level of every transaction. Keep transactions
short. Do not assume serializable behavior unless you asked for it.

**In practice.** Put the reads and writes that must be atomic in one transaction.
Do not call the network inside a transaction. Use row locks or optimistic
concurrency for contested writes. Document the anomaly the isolation level
allows.

**Smell.** A transaction that spans an HTTP request. A read-modify-write with no
lock or version check. `READ COMMITTED` assumed to prevent phantoms. Long
transactions holding locks during user think time.

**Source.** *Designing Data-Intensive Applications*, ch. 7 (Transactions);
*Database Internals*, ch. 5 (Transactionality and Recovery).

### A8-DATA-06 Safe migrations

**Rule.** Migrations are forward-only, reviewed, and safe to run while the old
code is still serving traffic. Expand, migrate, then contract.

**In practice.** Add nullable columns or new tables first. Backfill in bounded
batches. Dual-write or dual-read during the transition. Remove the old shape only
after every reader has moved. Test the migration on a production-sized copy.

**Smell.** A migration that rewrites a large table in one lock. A column rename
in the same deploy as the code change. A destructive migration with no backup. A
rollback that loses writes.

**Source.** *Designing Data-Intensive Applications*, ch. 4 (Encoding and
Evolution); *The Pragmatic Programmer*, Topic 19 (Version Control).

### A8-DATA-07 Parameterized SQL

**Rule.** Never build SQL by concatenating or interpolating untrusted values. Use
bound parameters or the query builder's parameter API.

**In practice.** Pass values separately from syntax. For dynamic identifiers
(table or column names), use an allowlist, not quoting. Apply the same rule to
`LIKE`, `IN`, and `ORDER BY` fragments.

**Smell.** ``query(`SELECT * FROM users WHERE id = ${id}`)``. `"... WHERE name =
'" + name + "'"`. A helper that accepts a raw `where` string. String-built
`ORDER BY`.

**Source.** *The Web Application Hacker's Handbook*, ch. 9 (Attacking Data
Stores); *Learning SQL*, ch. 3 (Query Primer).

### A8-DATA-08 Consistency and idempotency

**Rule.** Choose the consistency model per operation and make writes idempotent
when retries are possible. At-least-once delivery requires an idempotent
consumer.

**In practice.** Use a unique key or idempotency key for create operations. Make
updates conditional on a version or state. Record the outcome before acknowledging
the work. Design consumers to tolerate duplicates and out-of-order events.

**Smell.** A retried payment creates two charges. A consumer assumes each message
arrives once. A write that increments a counter without a dedupe key. A read that
assumes the replica is current.

**Source.** *Designing Data-Intensive Applications*, ch. 5 (Replication), ch. 7
(Transactions), and ch. 9 (Consistency and Consensus).

### A8-DATA-09 Keyset pagination

**Rule.** Paginate large or changing sets by a stable key, not by `OFFSET`. Offset
pagination gets slower and can skip or duplicate rows when data changes.

**In practice.** Order by a unique tiebreaker such as `(created_at, id)`. Return
an opaque cursor. Fetch `limit + 1` to know whether another page exists. Keep the
sort stable across requests.

**Smell.** `LIMIT 20 OFFSET 10000`. A page number in a UI over a live table.
Duplicate rows across pages. A cursor that is not unique.

**Source.** *Designing Data-Intensive Applications*, ch. 3 (Storage and
Retrieval); *Learning SQL*, ch. 3 (Query Primer).

### A8-DATA-10 Canonical representations

**Rule.** Store time, money, identifiers, and enums in one canonical form. Convert
at the edges, not in every query.

**In practice.** Store timestamps in UTC with an explicit type. Store money in
integer minor units plus a currency code. Use UUIDs or stable opaque IDs. Store
enums as constrained strings or lookup tables, not free text. Document the unit
in the column name or comment.

**Smell.** A `timestamp` without a time zone. A `float` for money. A status
column with five spellings of "active". IDs that change format between services.

**Source.** *Learning SQL*, ch. 7 (Data Generation, Conversion, and
Manipulation); *Designing Data-Intensive Applications*, ch. 4 (Encoding and
Evolution).
