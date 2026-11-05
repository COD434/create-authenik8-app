# @authenik8/design

Design systems as **versionable data**: validated design tokens, a
human/agent-readable brand spec, and doctor-style consistency checks with
stable IDs. Ecosystem milestone M3.

## Bundle format

A design-system directory contains:

- `tokens.json` — machine-readable design tokens (validated by a strict
  Zod schema, version 1): color groups, WCAG contrast pairs, typography
  scale, spacing scale
- `DESIGN.md` — the brand spec agents read (palette, typography, voice)

```json
{
  "schemaVersion": 1,
  "name": "example dark brand",
  "color": {
    "groups": { "base": { "background": "#0B1020", "ink": "#E8ECF8" } },
    "contrastPairs": [
      { "foreground": "color.base.ink", "background": "color.base.background", "kind": "body" }
    ]
  },
  "typography": { "family": "system-ui, sans-serif", "scale": { "md": "1rem" } },
  "spacing": { "scale": { "md": "16px" } }
}
```

## Consistency checks (doctor-style, stable IDs)

| ID | Check |
| --- | --- |
| `A8-DS-001` | `tokens.json` parses against the design tokens schema |
| `A8-DS-002` | required token groups are present and non-empty |
| `A8-DS-003` | declared contrast pairs meet WCAG 2.1 AA (4.5:1 body, 3:1 large) |
| `A8-DS-004` | hex colors referenced in `DESIGN.md` exist in `tokens.json` |

Findings are structured (`id`, `status: pass|fail|warn`, `message`,
`remediation`). Exit-code policy mirrors Authenik8 Doctor: warnings pass,
any fail exits 1.

```ts
import { runDesignChecks, formatFindings, renderTokensCss } from "@authenik8/design";

const result = await runDesignChecks("./design/my-brand");
if (!result.ok) console.error(formatFindings(result));
const css = renderTokensCss(bundle.tokens); // → :root { --color-base-ink: ... }
```

## Agent skills

`skills/` ships four OpenCode skills that consume this package (each has
its own `SKILL.md` + scripts importing the built dist; set `A8_DESIGN_DIST`
to relocate):

| Skill ID | Purpose |
| --- | --- |
| `design-audit` | Run `A8-DS-001..004` against a bundle, fix every failure (`scripts/check.mjs`, exit code = pass/fail) |
| `design-init` | Create a validated `tokens.json` + `DESIGN.md` from brand facts (draft → `scripts/validate.mjs` → write → audit) |
| `design-css` | Generate CSS custom properties from tokens (`scripts/css.mjs`, `--out`/`--selector`) |
| `design-contrast-fix` | Probe candidate colors numerically before committing (`scripts/contrast.mjs` per pair) |

Wire them into OpenCode via the config `skills` array, e.g.:

```jsonc
{ "skills": ["C:/<path>/authenik8/packages/design/skills"] }
```

## Boundaries

- Reads only `tokens.json` and `DESIGN.md` inside the declared directory.
- No writes, no network, no code execution (skill scripts write only
  where their documented `--out` flag says, and only CSS text).
- Contrast math is pure WCAG 2.x (tested against canonical values).

## Not yet (deliberate cuts)

Radius/shadow token groups are out of scope until a check needs them;
a page-spec-against-DESIGN.md skill is a candidate follow-up.
