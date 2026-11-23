---
name: Design Contrast Fix
description: Diagnose and fix WCAG AA contrast failures reported by Authenik8 check A8-DS-003, with a probe-then-commit loop
---

Fix `A8-DS-003` contrast failures: probe candidate colors numerically
BEFORE touching any file, then commit the winner to `tokens.json`.

## When to use

- The audit reports `A8-DS-003` with failing pairs.
- The user asks to make text meet WCAG AA or fix readability.

## Workflow

1. Parse the failing pair from the audit message, e.g.
   `pair 0: color.ink.low on color.surface.base is 3.12:1, below the WCAG
   AA 4.5:1 threshold for body text`. Resolve both refs to their hex
   values in `tokens.json` (`color.<group>.<token>` keys).
2. Probe candidates — no file writes, exit 0 = meets threshold:

   ```
   node <skill-dir>/scripts/contrast.mjs <fg-hex> <bg-hex> [body|large]
   ```

   `body` text needs 4.5:1, `large` needs 3:1.
3. Adjust LIGHTNESS first, hue second — small steps (±10–15% lightness)
   preserve the brand; only shift hue when lightness alone cannot pass.
   Try the next-lighter/next-darker token the palette already has before
   inventing a new color; probe 2–4 candidates, pick the one that passes
   with the smallest visual delta, and keep the original intent (a muted
   ink stays muted).
4. Update `tokens.json` (the probed hex, not a close guess). If the color
   appears in DESIGN.md, update it there too.
5. Re-run the design-audit skill and get a clean pass. Report: failing
   ratio → new ratio → the hex change.
