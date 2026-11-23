---
name: Design Audit
description: Audit a project's design system with Authenik8 checks A8-DS-001..004 (token schema, required groups, WCAG AA contrast, DESIGN.md sync) and fix every failure
---

Audit a design-system directory with the `@authenik8/design` checks and fix
all failures. A design-system directory contains `tokens.json` (required)
and optionally `DESIGN.md` beside it.

## When to use

- Before committing design-token, theme, or palette changes.
- When asked to check, audit, or verify a design system or theme.
- After editing `tokens.json` or `DESIGN.md`.

## Workflow

1. Locate the design-system directory (the one holding `tokens.json`). If
   the user points at a project, search from the project root for it.
2. Run the checks — `<skill-dir>` is this skill's base directory:

   ```
   node <skill-dir>/scripts/check.mjs <design-dir>
   ```

   Exit 0 = nothing failed, 1 = at least one check failed. Add `--json`
   for structured findings you can parse.
3. Fix failures one at a time, smallest check ID first. Each failing
   finding prints a `fix:` line — follow it.
   - `A8-DS-001` tokens.json invalid → repair it against the schema (the
     design-init skill has the exact shape).
   - `A8-DS-002` missing token groups → add them (color groups, contrast
     pairs, typography scale, spacing scale).
   - `A8-DS-003` WCAG AA contrast failures → use the design-contrast-fix
     skill for the candidate loop.
   - `A8-DS-004` DESIGN.md references hexes missing from tokens → reconcile
     the two files (they must agree).
4. Warnings (`!`) never fail the run — report them in your summary; do not
   silently drop them.
5. Re-run until exit 0, then include the final findings text verbatim in
   your report.

## Requirements

The built `@authenik8/design` dist three levels up from the script
(`npm run build` at the authenik8 workspace root). For a relocated install,
set `A8_DESIGN_DIST` to the dist entry file.
