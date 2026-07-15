import { describe, expect, it } from "vitest";

import { assertPresetRequirements, supportsFullstackPreset } from "../../src/lib/preflight.js";

describe("Authenik8 Node.js preflight", () => {
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

  it("gates every preset because core 2 requires modern Node.js", () => {
    expect(() => assertPresetRequirements("base", false, "18.20.0")).toThrow(
      "Authenik8 requires Node.js 20.19+",
    );
    expect(() => assertPresetRequirements("base", false, "22.12.0")).not.toThrow();
  });
});
