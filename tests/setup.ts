import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  process.env.FORCE_COLOR = "0";
  process.env.CI = "true";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
