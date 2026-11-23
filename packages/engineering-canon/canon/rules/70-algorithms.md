# Algorithms

Algorithm choices are design choices. State the input size, the access pattern,
and the cost you are accepting. Prefer the simplest structure that meets the
measured need.

### A8-ALG-01 State complexity

**Rule.** For every non-trivial algorithm, state time and space complexity in
terms of the input size. Say which input dominates and what happens at the
expected scale.

**In practice.** Write `O(n log n) time, O(n) space` in the comment or design
note. Identify the hot loop and the data structure that drives it. Re-check the
bound when the input distribution changes.

**Smell.** "It's fast enough." A nested loop over two large collections with no
bound. A claim of `O(1)` that hides a linear scan. A benchmark on ten rows.

**Source.** *Introduction to Algorithms*, ch. 3 (Growth of Functions); *The
Algorithm Design Manual*, ch. 2 (Algorithm Analysis).

### A8-ALG-02 Choose the data structure

**Rule.** Choose the data structure from the operations you need: lookup,
ordered traversal, range query, priority, deduplication, or membership. Do not
default to an array or an object for everything.

**In practice.** Use a map for keyed lookup, a set for membership, a heap for
priority, a sorted structure for ranges, and a queue for FIFO. Measure the
constant factors when the asymptotic choice is close. Prefer the standard
library's tested implementation.

**Smell.** `array.find` inside a loop over thousands of items. An object used as a
map with prototype pollution risk. A sorted array re-sorted on every insert. A
"cache" that is a linear scan.

**Source.** *Introduction to Algorithms*, Part III (Data Structures); *The
Algorithm Design Manual*, ch. 3 (Data Structures); *Grokking Algorithms*, ch. 5
(Hash Tables).

### A8-ALG-03 Use proven algorithms

**Rule.** Prefer a well-understood algorithm or library over a bespoke one unless
the constraints genuinely require it. If you write your own, state the invariant
and test it against a reference.

**In practice.** Use the platform's sort, hash, UUID, and crypto primitives. For a
domain-specific algorithm, cite the paper or standard and keep a reference
implementation in tests. Do not optimize a rare path at the cost of correctness.

**Smell.** A hand-rolled sort. A homemade UUID. A custom date parser. A "smart"
algorithm with no tests. A copied snippet with no source or license.

**Source.** *The Algorithm Design Manual*, ch. 1 (Introduction to Algorithm
Design); *The Pragmatic Programmer*, Topic 39 (Algorithm Speed).

### A8-ALG-04 Invariants and termination

**Rule.** For a loop or recursive algorithm, state the invariant that holds on
each iteration and the measure that decreases toward termination.

**In practice.** Write the invariant as a comment or assertion. Check the base
case and the progress step. For a loop, identify what changes and why it cannot
cycle forever. Test the zero, one, and maximum cases.

**Smell.** A `while (true)` with a break buried in a branch. A recursion with no
base case. A loop variable that can fail to advance. An invariant that is only
true on the happy path.

**Source.** *Introduction to Algorithms*, ch. 2 (Getting Started); *Structure and
Interpretation of Computer Programs*, ch. 1 (Building Abstractions with
Procedures).

### A8-ALG-05 Test edge cases and properties

**Rule.** Test the boundaries, the empty case, the single element, duplicates,
ordering, and the maximum size. Use property-based tests for invariants that
should hold for all inputs.

**In practice.** Write table-driven cases for boundaries. Add a property such as
"sorting is idempotent" or "encoding then decoding returns the original." Use a
reference implementation for comparison when available. Include a randomized test
with a fixed seed.

**Smell.** Tests only for the median case. A bug at `n = 0` or `n = 1`. A
comparison that assumes unique keys. A random test that cannot reproduce a
failure.

**Source.** *The Pragmatic Programmer*, Topic 42 (Property-Based Testing);
*Introduction to Algorithms*, ch. 2 (Getting Started).

### A8-ALG-06 Know intractability

**Rule.** Recognize when a problem is NP-hard or otherwise intractable at the
required scale. Use an approximation, a heuristic, or a constrained input with a
stated bound instead of an exponential search.

**In practice.** State the problem size and the acceptable quality. Use a proven
approximation ratio or a solver with a time limit. Make the fallback explicit.
Do not hide an exponential algorithm behind a small-looking default.

**Smell.** A brute-force subset search over 40 items. A "temporary" exhaustive
match. A solver with no timeout. An approximation with no quality bound.

**Source.** *Introduction to Algorithms*, ch. 34 (NP-Completeness); *The
Algorithm Design Manual*, ch. 10 (Intractable Problems and Approximation
Algorithms).

### A8-ALG-07 Bound recursion

**Rule.** Recursion needs a base case and a depth bound. If depth depends on
untrusted input, convert to iteration or enforce a limit.

**In practice.** Check the base case first. Keep the recursive step small. For
tree or graph traversal, track visited nodes. For parser or user input, cap depth
and return a clear error.

**Smell.** Stack overflow on deeply nested JSON. A recursive directory walk with
no depth limit. A graph traversal that revisits nodes. A recursive parser for
untrusted input.

**Source.** *Structure and Interpretation of Computer Programs*, ch. 1
(Recursive and iterative processes); *The C Programming Language*, ch. 4
(Functions and Program Structure).

### A8-ALG-08 Numeric correctness

**Rule.** Know the range, precision, and rounding of every numeric value. Use
integer minor units for money, avoid floating-point equality, and check overflow.

**In practice.** Store money as integer cents plus a currency code. Use a decimal
library for exact arithmetic. Compare floats with an epsilon. Validate ranges
before arithmetic. Use a big integer when values can exceed the safe integer
range.

**Smell.** `0.1 + 0.2 === 0.3`. A `float` column for prices. A counter that can
overflow. A percentage calculation that rounds twice. A timestamp in seconds
mixed with milliseconds.

**Source.** *The C Programming Language*, ch. 2 (Types, Operators, and
Expressions); *Introduction to Algorithms*, ch. 31 (Number-Theoretic Algorithms).
