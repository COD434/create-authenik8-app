import { z } from "zod";

import { isHexColor } from "./contrast.js";

/**
 * Design tokens as versionable data.
 *
 * `tokens.json` is the machine-readable source of truth for a design
 * system; `DESIGN.md` is its human/agent-readable companion. Both live at
 * the root of a design-system directory and are validated by this schema.
 * Unknown keys are rejected so drift is caught at load time.
 */

const hexSchema = z.string().refine(isHexColor, {
  message: "Colors must be 6-digit hex values like #0B1020",
});

const cssLengthSchema = z.string().regex(/^\d+(\.\d+)?(px|rem)$/, {
  message: "Lengths must be px or rem values like 16px or 1.25rem",
});

const colorGroupSchema = z.record(z.string(), hexSchema);

export const contrastPairSchema = z.strictObject({
  foreground: z.string().min(1),
  background: z.string().min(1),
  kind: z.enum(["body", "large"]),
});

export const designTokensSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(100),
  color: z.strictObject({
    groups: z.record(z.string(), colorGroupSchema),
    /** WCAG AA verification pairs, referenced as "color.<group>.<token>". */
    contrastPairs: z.array(contrastPairSchema),
  }),
  typography: z.strictObject({
    family: z.string().min(1),
    scale: z.record(z.string(), cssLengthSchema),
  }),
  spacing: z.strictObject({
    scale: z.record(z.string(), cssLengthSchema),
  }),
});

export type DesignTokens = z.infer<typeof designTokensSchema>;

/** Flatten tokens into dotted paths for CSS rendering and lookups. */
export function tokenPaths(tokens: DesignTokens): Array<{ path: string; value: string }> {
  const entries: Array<{ path: string; value: string }> = [];
  for (const [group, colorGroup] of Object.entries(tokens.color.groups)) {
    for (const [name, hex] of Object.entries(colorGroup)) {
      entries.push({ path: `color.${group}.${name}`, value: hex });
    }
  }
  entries.push({ path: "typography.family", value: tokens.typography.family });
  for (const [name, length] of Object.entries(tokens.typography.scale)) {
    entries.push({ path: `typography.scale.${name}`, value: length });
  }
  for (const [name, length] of Object.entries(tokens.spacing.scale)) {
    entries.push({ path: `spacing.scale.${name}`, value: length });
  }
  return entries;
}

/** Emit the tokens as CSS custom properties on :root. */
export function renderTokensCss(tokens: DesignTokens, options: { selector?: string } = {}): string {
  const selector = options.selector ?? ":root";
  const lines = [
    "/* Generated from tokens.json — do not edit by hand. */",
    `${selector} {`,
  ];
  for (const { path, value } of tokenPaths(tokens)) {
    lines.push(`  --${path.replace(/\./g, "-")}: ${value};`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

/** All hex values defined in the tokens, uppercase-normalized, deduplicated. */
export function tokenHexValues(tokens: DesignTokens): Set<string> {
  return new Set(
    Object.values(tokens.color.groups).flatMap((group) =>
      Object.values(group).map((hex) => hex.toUpperCase()),
    ),
  );
}

/** Resolve a "color.<group>.<token>" reference to its hex value. */
export function resolveColorRef(tokens: DesignTokens, ref: string): string | null {
  if (!ref.startsWith("color.")) return null;
  const segments = ref.split(".");
  if (segments.length !== 3) return null;
  const group = segments[1]!;
  const name = segments[2]!;
  const hex = tokens.color.groups[group]?.[name];
  return hex ?? null;
}
