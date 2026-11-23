# Foundations

These rules define what "good" means before any specific technology. When a
local convention is silent or two rules appear to conflict, return here.

### A8-FND-01 Complexity is the enemy

**Rule.** Judge a design by the cost of the next change, not by how impressive
it looks. Complexity is anything that makes a system hard to understand or
modify: dependencies, obscurity, and change amplification.

**In practice.** For a typical change, count the files, concepts, and handoffs
it touches. If that count grows every sprint, stop and simplify before adding
features. Prefer the design a new teammate can explain back to you.

**Smell.** "We cannot change X without also changing Y." A small feature needs a
long explanation. A bug fix requires reading five layers.

**Source.** *A Philosophy of Software Design*, ch. 2 (The Nature of Complexity);
*The Pragmatic Programmer*, Topic 8 (The Essence of Good Design).

### A8-FND-02 Design for change

**Rule.** Optimize for ease of change (ETC), not for speculative reuse. Every
design principle is a special case of making the next change cheaper.

**In practice.** Ask "what is most likely to change here?" and isolate that axis.
Do not build extension points for changes nobody has requested. Prefer a simple
design that can be refactored over a flexible design that must be understood now.

**Smell.** A framework with one caller. A plugin system with no plugins. An
abstraction introduced "just in case."

**Source.** *The Pragmatic Programmer*, Topic 8 (ETC) and Tip 14; *A Philosophy
of Software Design*, ch. 11 (Design it Twice).

### A8-FND-03 DRY is about knowledge

**Rule.** Do not repeat a single piece of knowledge in two places. Duplicated
text is not automatically duplication; two similar-looking blocks may encode
different decisions that will diverge.

**In practice.** Ask what must stay true if one copy changes. If the answer is
"both", extract one owner. If the copies change for different reasons, leave
them separate and name the difference.

**Smell.** A constant, validation rule, or business policy copied across
modules. A "shared" helper that every caller configures differently.

**Source.** *The Pragmatic Programmer*, Topic 9 (DRY: The Evils of Duplication);
*A Philosophy of Software Design*, ch. 9 (Better Together Or Better Apart).

### A8-FND-04 Orthogonality

**Rule.** Keep concerns independent so a change in one does not ripple through
the others. Each module should have one axis of change.

**In practice.** Separate policy from mechanism, transport from domain, and
storage from behavior. A change to the database schema should not force a change
to UI copy. A change to the UI layout should not force a change to authorization.

**Smell.** A single "god" service that knows HTTP, SQL, business rules, and
presentation. A change that requires editing every layer in lockstep.

**Source.** *The Pragmatic Programmer*, Topic 10 (Orthogonality); *A Philosophy
of Software Design*, ch. 7 (Different Layer, Different Abstraction).

### A8-FND-05 Reversibility

**Rule.** Keep hard decisions cheap to undo. Prefer reversible choices when the
information is incomplete, and record what would make you reverse course.

**In practice.** Isolate vendors behind narrow interfaces. Keep schema changes
additive. Use feature flags for risky behavior. Write the exit condition in the
ADR before committing.

**Smell.** A vendor SDK imported across the codebase. A one-way data migration
with no rollback. A public API shape chosen before the first real consumer.

**Source.** *The Pragmatic Programmer*, Topic 11 (Reversibility); *Software
Architecture: The Hard Parts*, ch. 11 (Analyzing Architecture Risk).

### A8-FND-06 Tracer bullets

**Rule.** Build one thin end-to-end slice before building breadth. The slice
proves the integration, the data flow, and the deployment path.

**In practice.** For a new feature, make the smallest path work through every
layer: input, validation, domain action, persistence, response, and test. Then
thicken it. Do not build all the models first and integrate later.

**Smell.** Weeks of layer-by-layer work with no runnable path. A demo that
works only because the hard parts are stubbed.

**Source.** *The Pragmatic Programmer*, Topic 12 (Tracer Bullets); *Working
Effectively with Legacy Code*, ch. 2 (Working with Feedback).

### A8-FND-07 Design twice

**Rule.** For a hard boundary, data model, or auth flow, sketch at least two
credible designs before choosing. Compare them on change cost, failure modes,
and the interface they expose.

**In practice.** Spend a short, fixed time on each alternative. Write the
tradeoff in one paragraph. Pick one, but keep the losing sketch in the ADR so
the next engineer knows what was considered.

**Smell.** The first design becomes the only design. A decision review with no
alternatives. A boundary that is hard to explain without a diagram of calls.

**Source.** *A Philosophy of Software Design*, ch. 11 (Design it Twice);
*Software Architecture: The Hard Parts*, ch. 11 (Analyzing Architecture Risk).

### A8-FND-08 No programming by coincidence

**Rule.** Make the code work for reasons you can state. Do not rely on
undocumented behavior, accidental ordering, or a framework's current defaults.

**In practice.** Write down the invariant that makes the code correct. Test the
assumption that matters. If you cannot explain why a line is needed, delete it or
find out before shipping.

**Smell.** "It works, but I am not sure why." A fix that depends on a timing
detail or a library quirk. Defensive code copied without understanding.

**Source.** *The Pragmatic Programmer*, Topic 38 (Programming by Coincidence);
*A Philosophy of Software Design*, ch. 18 (Code Should be Obvious).
