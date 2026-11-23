/**
 * WCAG 2.x contrast math (pure functions, no I/O).
 *
 * Reference luminance and contrast ratio per the WCAG formula. Thresholds:
 * WCAG 2.1 AA — 4.5:1 for body text, 3:1 for large text (>= 18pt regular or
 * >= 14pt bold).
 */

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value);
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a 6-digit hex color. */
export function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** Contrast ratio between two hex colors (1..21), order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type TextKind = "body" | "large";

export function contrastThreshold(kind: TextKind): number {
  return kind === "body" ? 4.5 : 3;
}

/** True when the pair meets the WCAG 2.1 AA threshold for its text kind. */
export function meetsAA(foreground: string, background: string, kind: TextKind): boolean {
  return contrastRatio(foreground, background) >= contrastThreshold(kind);
}
