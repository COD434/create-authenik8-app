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

## Boundaries

- Reads only `tokens.json` and `DESIGN.md` inside the declared directory.
- No writes, no network, no code execution.
- Contrast math is pure WCAG 2.x (tested against canonical values).

## Not yet (deliberate cuts)

Agent skills (design-system scaffold, page spec against DESIGN.md) consume
this data and arrive as a follow-up slice; radius/shadow token groups are
out of scope until a check needs them.
