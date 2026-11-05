import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  designTokensSchema,
  renderTokensCss,
  resolveColorRef,
  tokenHexValues,
  tokenPaths,
} from "../src/tokens.js";

const secureTokens = JSON.parse(
  readFileSync(new URL("./fixtures/secure/tokens.json", import.meta.url), "utf8"),
) as unknown;

describe("design tokens schema", () => {
  it("accepts the secure fixture", () => {
    expect(designTokensSchema.safeParse(secureTokens).success).toBe(true);
  });

  it("rejects unknown keys, bad hex, and bad lengths", () => {
    expect(designTokensSchema.safeParse({ ...secureTokens as object, extra: true }).success).toBe(false);

    const badHex = structuredClone(secureTokens) as { color: { groups: Record<string, Record<string, string>> } };
    badHex.color.groups.base.ink = "#E8ECF"; // 5 digits
    const result = designTokensSchema.safeParse(badHex);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path.join(".")).toContain("ink");

    const badLength = structuredClone(secureTokens) as { spacing: { scale: Record<string, string> } };
    badLength.spacing.scale.md = "16";
    expect(designTokensSchema.safeParse(badLength).success).toBe(false);

    const badKind = structuredClone(secureTokens) as { color: { contrastPairs: Array<Record<string, unknown>> } };
    badKind.color.contrastPairs[0]!.kind = "huge";
    expect(designTokensSchema.safeParse(badKind).success).toBe(false);
  });
});

describe("token utilities", () => {
  it("flattens tokens to dotted paths", () => {
    const tokens = designTokensSchema.parse(secureTokens);
    const paths = tokenPaths(tokens);
    expect(paths).toContainEqual({ path: "color.base.ink", value: "#E8ECF8" });
    expect(paths).toContainEqual({ path: "typography.family", value: "system-ui, sans-serif" });
    expect(paths).toContainEqual({ path: "spacing.scale.md", value: "16px" });
    // 6 colors + family + 4 type scale + 4 spacing scale
    expect(paths).toHaveLength(15);
  });

  it("renders CSS custom properties", () => {
    const tokens = designTokensSchema.parse(secureTokens);
    const css = renderTokensCss(tokens);
    expect(css).toContain("/* Generated from tokens.json — do not edit by hand. */");
    expect(css).toContain(":root {");
    expect(css).toContain("--color-base-ink: #E8ECF8;");
    expect(css).toContain("--typography-scale-md: 1rem;");
    expect(css).toContain("--spacing-scale-lg: 32px;");
    expect(css.trim().endsWith("}")).toBe(true);
  });

  it("resolves color references and normalizes hex sets", () => {
    const tokens = designTokensSchema.parse(secureTokens);
    expect(resolveColorRef(tokens, "color.base.accent")).toBe("#F5B942");
    expect(resolveColorRef(tokens, "color.base.missing")).toBeNull();
    expect(resolveColorRef(tokens, "color.accent")).toBeNull();
    expect(resolveColorRef(tokens, "typography.family")).toBeNull();

    const hexes = tokenHexValues(tokens);
    expect(hexes.has("#E8ECF8")).toBe(true);
    expect(hexes.size).toBe(6);
  });
});
