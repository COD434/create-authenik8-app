# Authenik8 Studio, Design System

The visual system for the Authenik8 Studio workspace. `tokens.json` is the
machine-readable source. `public/style.css` hand-syncs those values into
semantic custom properties for both appearances. The badge in
`public/authenik8-logo.svg` is the brand source of truth.

## Brand

**Authenik8.** A workshop with the security badge on the wall, not a
billboard. Quiet surfaces, precise type, one mint signal colour. The product
should read as a development environment with a capable collaborator inside
it, not as a generic dashboard with a chat box attached.

Persona: technical, calm, precise, dependable, approachable. Motion only
confirms state.

## Surface and ink palette

### Dark appearance

| Token | Hex | Role |
| --- | --- | --- |
| dark.background | `#0C100D` | application background |
| dark.sidebar | `#090C0A` | navigation rail |
| dark.surface | `#141A16` | primary panels |
| dark.elevated | `#191F1B` | menus, modal surfaces |
| dark.hover | `#1F2722` | interactive hover |
| dark.border | `#2A342D` | hairlines and boundaries |
| dark.textPrimary | `#EDF2EE` | primary content |
| dark.textSecondary | `#A9B5AC` | supporting content |
| dark.textMuted | `#7C887F` | metadata and labels |
| dark.accent | `#39C978` | primary action fill |
| dark.accentHover | `#5CDD93` | action hover |
| dark.accentSoft | `#12271B` | tinted accent surface |
| dark.onAccent | `#07120B` | text and icons on the accent |
| dark.success | `#5FD08A` | completed states |
| dark.warning | `#E6B45C` | warnings |
| dark.danger | `#FF7B7B` | errors |
| dark.focusRing | `#7CE8AA` | keyboard focus |

### Light appearance

| Token | Hex | Role |
| --- | --- | --- |
| light.background | `#F6F7F4` | application background |
| light.sidebar | `#EFF2ED` | navigation rail |
| light.surface | `#FFFFFF` | primary panels |
| light.elevated | `#FFFFFF` | menus, modal surfaces |
| light.hover | `#E8ECE7` | interactive hover |
| light.border | `#D9E0D9` | hairlines and boundaries |
| light.textPrimary | `#1B211D` | primary content |
| light.textSecondary | `#4F5B53` | supporting content |
| light.textMuted | `#65716A` | metadata and labels |
| light.accent | `#237A4C` | primary action fill |
| light.accentHover | `#1B633E` | action hover |
| light.accentSoft | `#E4F4EA` | tinted accent surface |
| light.onAccent | `#FFFFFF` | text and icons on the accent |
| light.success | `#1E6E45` | completed states |
| light.warning | `#7A4C00` | warnings |
| light.danger | `#B42318` | errors |
| light.focusRing | `#237A4C` | keyboard focus |

Every declared contrast pair meets WCAG 2.1 AA at body size. The accent is
not used as body text in light mode: `light.accent` is the action fill and
`light.textMuted` is the lowest text tone. Borders never carry information
on their own.

## Typography

Interface face:

`ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`

Technical face:

`ui-monospace, 'Cascadia Code', Consolas, monospace`

No webfont downloads. The same-origin rule is part of the trust boundary.

| Style | Size | Weight | Use |
| --- | ---: | ---: | --- |
| Display | 32px | 600 | home greeting |
| Page | 24px | 600 | page titles |
| Section | 18px | 600 | dialog and panel titles |
| Subheading | 15px | 600 | group headings |
| Body | 14px | 400 | conversation and controls |
| Supporting | 13px | 400 | secondary prose |
| Metadata | 12px | 400 | labels, timestamps, paths |
| Code | 13px | 400 | code, terminal, identifiers |

Inside the workspace, headings stay small. The conversation is the largest
surface, so it sets the reading rhythm.

## Spacing and radius

Spacing uses a four-point scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
Whitespace creates hierarchy; it is not applied uniformly to every block.

| Element | Radius |
| --- | ---: |
| Small controls | 6px |
| Buttons | 8px |
| Inputs and panels | 10px |
| Modals and workspace surfaces | 12px |

Pill shapes are reserved for compact selectors, status chips, and tool
activity rows. Main panels are rectangular.

## Elevation

Use surface contrast and 1px borders before shadow. Dark mode relies on the
surface ramp. Light mode uses a faint shadow only for floating menus and
dialogs. There is no decorative gradient layer.

## Layout

- Expanded sidebar: 248px. Collapsed: 64px. Off-canvas below 900px.
- Conversation reading column: 760px.
- Composer column: 760px.
- Preview: right pane above 1100px, overlay below it.
- Run dock: bottom panel spanning the workspace.
- Top bar: 56px, one line, minimal.

The shell has one navigation rail, one workspace column, optional project
surfaces, and global overlays. Modes are not separate applications.

## Components and states

Controls have default, hover, focus, active, disabled, loading, and error
states. Every interactive control is reachable by keyboard and shows the
focus ring. Destructive actions state what will happen. Empty states use
type and useful actions, not illustrations.

Messages:

- User messages are compact right-aligned bubbles.
- Assistant messages are document-like, with headings, lists, inline code,
  and fenced code blocks.
- Tool activity is a quiet status row, not a fake terminal.
- Streaming shows a caret, never a fake percentage.

## Voice

Short, declarative, honest about risk. Say what will happen and what the
person can do next. No exclamation marks, no marketing adjectives, no em
dashes in user-visible copy. Prefer a period, a colon, or a comma.

## Do

- Use `accent` for one primary action per surface.
- Use `accentSoft` for selected and tinted states.
- Use the real badge for brand moments; never redraw or recolor the mark.
- Test every screen in both appearances.
- Keep the conversation central and advanced tools discoverable.
- Hide or disable controls that the backend cannot support.

## Don't

- No external fonts, icon CDNs, analytics, or remote assets.
- No fake progress, fake security scores, or decorative terminals.
- No secondary component system. Extend these primitives.
- No saturated colour outside the accent, success, warning, and danger.
- No text below 12px.
