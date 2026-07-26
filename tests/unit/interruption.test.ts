import { describe, expect, it } from "vitest";

import {
  canResumeSetup,
  interruptionExitCode,
  restartCommand,
} from "../../src/lib/interruption.js";

describe("interrupted setup guidance", () => {
  it("preserves production intent in resumable commands", () => {
    expect(restartCommand({
      projectName: "demo-app",
      productionReady: true,
      resume: true,
      packageManager: "pnpm",
      skipInstall: true,
    })).toBe(
      "npx create-authenik8-app demo-app --package-manager pnpm --no-install --production-ready --resume",
    );
  });

  it("restarts instead of resuming before prompt answers have been saved", () => {
    expect(canResumeSetup("start")).toBe(false);
    expect(canResumeSetup("prompts")).toBe(true);
    expect(canResumeSetup("done")).toBe(false);
  });

  it("returns conventional non-success signal exit codes", () => {
    expect(interruptionExitCode("SIGINT")).toBe(130);
    expect(interruptionExitCode("SIGTERM")).toBe(143);
  });
});
