import { describe, expect, it } from "vitest";

import { projectNameError } from "../../src/lib/projectName.js";

describe("projectNameError", () => {
  it.each(["my-app", "app_2", "api.v2"])('accepts "%s"', (name) => {
    expect(projectNameError(name)).toBeUndefined();
  });

  it.each(["../outside", ".", "My App", "UPPERCASE", "-flag", "@scope/app"])('rejects "%s"', (name) => {
    expect(projectNameError(name)).toBeTypeOf("string");
  });
});
