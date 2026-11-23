# Reliability

Reliability is the ability to keep doing the right thing when a dependency is
slow, a request is retried, a process dies, or traffic doubles. Design the failure
path before the happy path.

### A8-REL-01 Design for failure

**Rule.** Every network call, disk read, and external service can fail, hang, or
return a partial result. Set timeouts, bound retries, and make failure visible.

**In practice.** Use a timeout on every outbound call. Retry only idempotent
operations, with exponential backoff and jitter. Use a circuit breaker for a
dependency that is failing persistently. Return a typed failure to the caller
instead of hanging.

**Smell.** `fetch(url)` with no timeout. Infinite retries. A retry loop with no
backoff. A dependency failure that takes down the whole request path. A
"temporary" catch that hides the outage.

**Source.** *Designing Data-Intensive Applications*, ch. 8 (The Trouble with
Distributed Systems); *The Pragmatic Programmer*, ch. 4 (Pragmatic Paranoia).

### A8-REL-02 Idempotency

**Rule.** A retried write must not create a duplicate effect. Give create and
payment operations an idempotency key, and make consumers tolerate duplicate
delivery.

**In practice.** Store the key with the result and return the same result on
replay. Use a unique constraint as the final guard. Make state transitions
conditional on the current state or a version. Record the outcome before
acknowledging the message.

**Smell.** A retried request creates two rows. A queue consumer assumes
exactly-once delivery. A "mark as processed" step after the side effect. A
non-idempotent `PUT`.

**Source.** *Designing Data-Intensive Applications*, ch. 7 (Transactions) and
ch. 11 (Stream Processing); *The Pragmatic Programmer*, Topic 23 (Design by
Contract).

### A8-REL-03 Backpressure and bounds

**Rule.** Every queue, buffer, cache, and pool has a bound. When the bound is
reached, apply backpressure or reject; do not grow without limit.

**In practice.** Set maximum queue length, concurrency, body size, and cache
entries. Return `429` or `503` with a retry hint when overloaded. Drop or coalesce
low-value work before exhausting memory. Monitor queue depth and latency.

**Smell.** An unbounded `Promise.all` over user input. A queue with no max
length. A cache keyed by user input with no eviction. A batch job that loads a
whole table into memory.

**Source.** *Designing Data-Intensive Applications*, ch. 8 (The Trouble with
Distributed Systems) and ch. 11 (Stream Processing); *The Pragmatic Programmer*,
ch. 6 (Concurrency).

### A8-REL-04 Observability

**Rule.** Make the system explain itself: structured logs, metrics, traces, and
correlation IDs. Log decisions and failures, not just entry and exit.

**In practice.** Use one correlation ID per request and propagate it across
services. Log the operation, outcome, duration, and relevant IDs. Emit metrics for
latency, error rate, saturation, and queue depth. Never log secrets or full
personal data.

**Smell.** `console.log("here")`. A production incident with no request ID. A
dashboard that only shows CPU. Logs that cannot be joined across services. A
metric with no owner or alert.

**Source.** *Designing Data-Intensive Applications*, ch. 1 (Reliable, Scalable,
and Maintainable Applications); *The Pragmatic Programmer*, Topic 20 (Debugging).

### A8-REL-05 Fail fast, no silent catch

**Rule.** If the system cannot do the right thing, stop the operation and report
it. Never swallow an error, continue with corrupt state, or return a fake success.
A documented, non-critical degradation is the one exception: the catch must name
the failure, explain why the caller can proceed, and leave the system in a valid
state (see A8-REL-06).

**In practice.** Validate preconditions at the start. Rethrow with context. Use a
top-level handler that logs and returns a safe error. In background work, mark the
job failed and make it retryable or dead-letter it. When a failure is genuinely
non-critical, state the reason at the catch and keep the fallback honest.

**Smell.** `catch {}` with no explanation. `catch (e) { console.log(e) }` and
continue. A default return value that hides a failure. A health check that
reports healthy while the database is down.

**Source.** *The Pragmatic Programmer*, Topic 24 (Dead Programs Tell No Lies);
*A Philosophy of Software Design*, ch. 10 (Define Errors Out of Existence).

### A8-REL-06 Graceful degradation

**Rule.** Decide which features can degrade and which must stay correct. A
partial outage should not become a total outage.

**In practice.** Serve cached or stale data with an explicit freshness marker when
a dependency is down. Disable non-critical features behind a flag. Keep the
critical path independent of optional services. Tell the user what is unavailable.

**Smell.** A recommendation service outage blocks checkout. A missing avatar
fails the whole page. A health check depends on every optional integration. A
fallback that silently returns wrong data.

**Source.** *Designing Data-Intensive Applications*, ch. 1 (Reliability);
*Software Architecture: The Hard Parts*, ch. 11 (Analyzing Architecture Risk).

### A8-REL-07 Concurrency discipline

**Rule.** Minimize shared mutable state. Prefer message passing, immutable data,
and a single owner per resource. Document ordering and atomicity assumptions.

**In practice.** Use a queue or actor for a resource that must be serialized. Use
transactions or compare-and-swap for contested writes. Avoid locks across I/O.
Test interleavings that matter, not just the happy path.

**Smell.** Two async tasks mutate the same object. A lock held during a network
call. A check-then-act race. A "thread-safe" claim with no test. A global
connection reused across concurrent requests.

**Source.** *The Pragmatic Programmer*, ch. 6 (Concurrency); *Designing
Data-Intensive Applications*, ch. 8 (The Trouble with Distributed Systems).

### A8-REL-08 Durability and restore

**Rule.** A backup you have not restored is not a backup. Know the recovery point
and recovery time objectives, and test the restore path.

**In practice.** Back up the database and the configuration needed to run it.
Encrypt backups and restrict access. Restore into a clean environment on a
schedule. Test migrations against a restored copy. Record the runbook and the
owner.

**Smell.** A backup job with no alert. A restore that has never been tried. A
migration that cannot run on a production-sized copy. A single region with no
recovery plan.

**Source.** *Designing Data-Intensive Applications*, ch. 5 (Replication);
*Database Internals*, ch. 5 (Transactionality and Recovery).

### A8-REL-09 Measure before optimizing

**Rule.** Optimize the measured bottleneck, not the suspected one. State the
baseline, the target, and the cost of the change.

**In practice.** Measure latency and throughput under realistic load. Profile
before changing an algorithm or adding a cache. Re-measure after the change.
Prefer a simpler design if the performance gain is not material.

**Smell.** A cache added with no hit-rate measurement. A micro-optimization in a
cold path. A benchmark that does not resemble production. A performance claim
with no baseline.

**Source.** *A Philosophy of Software Design*, ch. 20 (Designing for Performance);
*The Pragmatic Programmer*, Topic 39 (Algorithm Speed).
