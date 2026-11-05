---
name: Design Init
description: Create a validated tokens.json and DESIGN.md design-system bundle for a project or brand from scratch
---

Create a new design-system bundle (`tokens.json` + `DESIGN.md`) that passes
the Authenik8 schema on the first write, not after five failed iterations.

## When to use

- Setting up a design system for a new project.
- The audit reports `A8-DS-001` because `tokens.json` is missing or broken.

## Workflow

1. Collect the brand facts: name, palette (hex), type family, and — if the
   user has brand material (a logo spec, a DESIGN.md draft, a style guide) —
   derive the values from it. Ask for what is missing instead of inventing
   a whole brand.
2. Draft `tokens.json` with EXACTLY this shape (unknown keys are rejected;
   colors are 6-digit hex like `#0B1020`; lengths are px or rem):

   ```json
   {
     "schemaVersion": 1,
     "name": "Example Brand",
     "color": {
       "groups": {
         "surface": { "base": "#0B1020", "raised": "#111A2E" },
         "ink": { "high": "#F2F5FA", "low": "#9AA7BC" },
         "accent": { "primary": "#F5B942" }
       },
       "contrastPairs": [
         { "foreground": "color.ink.high", "background": "color.surface.base", "kind": "body" }
       ]
     },
     "typography": {
       "family": "Inter, system-ui, sans-serif",
       "scale": { "sm": "0.875rem", "md": "1rem", "lg": "1.25rem" }
     },
     "spacing": {
       "scale": { "sm": "8px", "md": "16px", "lg": "24px" }
     }
   }
   ```

   Replace the values, keep the keys. Every text-on-background combination
   the UI uses should become a `contrastPairs` entry (kind: `body` or
   `large`); use the design-contrast-fix skill to tune them.
3. Validate the DRAFT before writing it into the project:

   ```
   node <skill-dir>/scripts/validate.mjs <path-to-drafted-tokens.json>
   ```

   Exit 0 = valid, 1 = invalid (first issue is printed). Fix and re-run.
4. Write `tokens.json` into the design-system directory, then write
   `DESIGN.md` beside it: name, palette table (hexes MUST match tokens —
   the audit checks this), typography, voice, do/don't rules.
5. Run the design-audit skill and get a clean pass.

## Requirements

Built `@authenik8/design` dist three levels up from the script; override
with `A8_DESIGN_DIST` for relocated installs.
