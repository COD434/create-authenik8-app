# Authenik8 — Design System

The visual system of the studio's own skin. Applied as CSS custom
properties generated from `tokens.json` (`renderTokensCss`) — the skin is
built with the workspace's own tooling and passes every A8-DS check.

## Brand

**Authenik8.** Not "Studio Web", nothing appended: the product is the name.
The real mark is the mint security badge (`public/authenik8-logo.svg`):
an interlocked A and 8 inside a deep-green disc, ringed in mint. The theme
follows the mark: quiet dark surfaces, one security-green action color,
one lighter mint for signal and focus. Persona: calm, precise,
craftsmanlike, security-first. The interface should feel like a workshop
with the badge on the wall, not a billboard: nothing shouts, motion only
when it confirms state.

The chat surface follows the modern AI-chat layout: a centered column with
generous whitespace, an empty state that greets you (badge, one question,
starter prompts), a floating composer pill with the model chip inside it,
assistant replies as plain flowing text beside a small badge avatar, and
the user's messages as compact right-aligned bubbles.

## Palette

| Group | Token | Hex | Role |
| --- | --- | --- | --- |
| surface | base | `#0A0D16` | app background |
| surface | raised | `#131828` | sidebar, panels, agent cards |
| surface | field | `#181F32` | inputs, output terminals, composer pill |
| surface | line | `#232C44` | hairline borders and separators |
| ink | high | `#F2F5FA` | primary text |
| ink | mid | `#C2CADA` | secondary text, tool lines |
| ink | low | `#8B94A7` | labels, hints, timestamp-like text |
| accent | primary | `#39C978` | badge green: the action color (Send, Run agent) |
| accent | secondary | `#7CE8AA` | light mint: focus rings, hover signal, pulse |
| accent | onPrimary | `#14171F` | text/icon on the green fill |
| status | danger | `#FF6C6C` | errors |

Contrast pairs (`contrastPairs` in tokens.json) cover text on base,
raised, field, green, and error text; all meet WCAG AA at their text size.

## Typography

`system-ui, 'Segoe UI', Roboto, 'Cascadia Code', sans-serif`

Same-origin constraint: no webfont downloads, ever. The system stack keeps
the interface native. Scale:

- `xs` 0.75rem — footnotes, terminal output
- `sm` 0.875rem — labels, tool lines, preview bar
- `md` 1rem — chat text, buttons
- `lg` 1.25rem — brand name, modal headings
- `xl` 1.5rem — the greeting on the empty state

Monospace contexts (terminal output, tool lines) use the same stack's
monospace face (`ui-monospace, 'Cascadia Code', Consolas`).

## Voice

Short, declarative, honest about risk. Warnings state what will happen
("runs unsupervised with auto-approve") and what the user can do ("close
this page to abort"). No exclamation marks, no marketing adjectives. No
em dashes anywhere a user can read: prefer periods, colons, and commas.

## Do

- Use green `accent.primary` for exactly one primary action per surface.
- Use light mint `accent.secondary` as a signal (focus, hover), never as a fill.
- Keep elevation through the surface ramp (base → raised → field) plus
  soft shadows; borders are `surface.line`, 1px.
- Use the real badge (`/authenik8-logo.svg`, or the compact inline copy for
  message avatars); never redraw or recolor the mark.
- Animate state changes (message entrance, pane slide) in ≤200ms; honor
  `prefers-reduced-motion`.

## Don't

- No external fonts, icon CDNs, or analytics scripts — same-origin only,
  icons are inline SVG.
- No gradients as a substitute for the surface ramp; at most a faint
  radial vignette on the base surface.
- No drop of saturated color outside the two accents and danger.
- No text below the `xs` scale.
