import { describe, expect, it } from "vitest";

import { assertPresetRequirements, supportsFullstackPreset } from "../../src/lib/preflight.js";

describe("Prisma 7 Node.js preflight", () => {
  it.each([
    ["20.18.9", false],
    ["20.19.0", true],
    ["v21.1.0", false],
    ["22.11.0", false],
    ["22.12.0", true],
    ["23.1.0", false],
    ["24.0.0", true],
  ])("evaluates Node.js %s", (version, expected) => {
    expect(supportsFullstackPreset(version)).toBe(expected);
  });

  it("does not gate a Prisma-free API preset", () => {
    expect(() => assertPresetRequirements("base", false)).not.toThrow();
  });
});
