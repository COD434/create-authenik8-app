---
name: Algorithm Choice
description: Choose and verify algorithms and data structures with explicit complexity, invariants, edge cases, and intractability bounds
---

# Algorithm Choice

Use when a change introduces a non-trivial algorithm, a data-structure choice, a
performance-sensitive loop, or a problem that may be intractable at the required
scale. Read `../../canon/rules/70-algorithms.md`.

## Workflow

1. **State the input.** Size, distribution, growth rate, and whether it is
   untrusted. Name the dominant operation.
2. **List the operations.** Lookup, insert, delete, range, order, priority,
   membership, deduplication, or traversal. Match the structure to the mix.
3. **Sketch two candidates.** For each, state time and space complexity, the
   constant factors, and the failure mode at scale.
4. **Choose the simpler one** that meets the measured need. Prefer a standard
   library implementation.
5. **State the invariant.** Write the loop invariant, the recursion base case,
   and the termination measure.
6. **Handle the edges.** Empty, one, duplicates, sorted/reverse, maximum size,
   invalid input, and numeric limits.
7. **Test.** Table-driven boundaries, a reference implementation, and a
   property-based test where useful.
8. **Measure.** Benchmark under realistic input before optimizing further.

## Complexity note template

```text
Algorithm:
Input:
Time:
Space:
Dominant operation:
Assumption:
Worst case:
```

## Data-structure guide

| Need | Structure |
| --- | --- |
| Keyed lookup | Hash map |
| Membership | Hash set |
| Ordered traversal / range | Balanced tree or sorted array |
| Priority | Heap |
| FIFO work | Queue |
| Deduplication | Set or unique constraint |
| Prefix search | Trie |
| Graph traversal | Adjacency list plus visited set |
| Top-k | Heap of size k |

## Correctness checklist

- The base case is reached.
- The recursive step makes progress.
- The loop invariant holds on entry and after each iteration.
- The termination measure decreases.
- The algorithm handles duplicates and ties deterministically.
- The numeric range cannot overflow or lose precision.
- The worst case is acceptable for the maximum input.

## Output contract

1. **Choice:** the algorithm and data structure.
2. **Complexity:** time and space, with the dominant input.
3. **Invariant:** why it is correct.
4. **Tests:** boundaries and properties.
5. **Measurement:** the benchmark or the reason it is unnecessary.

## Stop conditions

- The only exact algorithm is exponential at the required scale.
- The input bound is unknown and the user cannot provide it.
- The optimization would make the code materially harder to verify.
