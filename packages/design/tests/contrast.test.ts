import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  contrastThreshold,
  isHexColor,
  meetsAA,
  relativeLuminance,
} from "../src/contrast.js";

describe("contrast math (WCAG 2.x)", () => {
  it("validates 6-digit hex colors only", () => {
    expect(isHexColor("#0B1020")).toBe(true);
    expect(isHexColor("#e8ecf8")).toBe(true);
    expect(isHexColor("#FFF")).toBe(false);
    expect(isHexColor("#GGGGGG")).toBe(false);
    expect(isHexColor("0B1020")).toBe(false);
    expect(isHexColor("#0B1020FF")).toBe(false);
  });

  it("returns the canonical luminance and ratio values", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    // Canonical WCAG example: white vs black is exactly 21:1.
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    // WebAIM reference grays: #767676 passes body AA, #777777 does not.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#0B1020", "#E8ECF8")).toBe(contrastRatio("#E8ECF8", "#0B1020"));
  });

  it("applies the WCAG 2.1 AA thresholds", () => {
    expect(contrastThreshold("body")).toBe(4.5);
    expect(contrastThreshold("large")).toBe(3);
    expect(meetsAA("#767676", "#FFFFFF", "body")).toBe(true);
    expect(meetsAA("#777777", "#FFFFFF", "body")).toBe(false);
    expect(meetsAA("#777777", "#FFFFFF", "large")).toBe(true);
  });
});
