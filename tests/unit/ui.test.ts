import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spinnerMock = vi.hoisted(() => ({
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  stop: vi.fn(),
  text: "",
  isSpinning: true,
}));

vi.mock("ora", () => ({ default: vi.fn(() => spinnerMock) }));

import * as ui from "../../src/lib/ui.js";

describe("CLI progress UI", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    spinnerMock.isSpinning = true;
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("renders a compact static title without clearing the terminal", async () => {
    const clearSpy = vi.spyOn(console, "clear").mockImplementation(() => {});

    await ui.showBootLogo();

    expect(consoleLogSpy.mock.calls.flat().join(" ")).toContain("create-authenik8-app");
    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("prints the selected configuration", () => {
    ui.renderConfiguration({
      step: "prompts",
      projectName: "demo-app",
      authMode: "fullstack",
      usePrisma: true,
      database: "postgresql",
      installDeps: true,
    });

    const output = consoleLogSpy.mock.calls.flat().join(" ");
    expect(output).toContain("Full-stack application");
    expect(output).toContain("PostgreSQL");
    expect(output).toContain("Package manager");
  });

  it("uses one task state and a durable completion line", () => {
    ui.startStep("project-created");
    ui.completeStep("project-created");

    if (ui.animatedProgress) {
      expect(spinnerMock.start).toHaveBeenCalledWith("Create project files");
      expect(spinnerMock.succeed).toHaveBeenCalledWith("Create project files");
    } else {
      expect(spinnerMock.text).toBe("Create project files");
      expect(consoleLogSpy.mock.calls.flat().join(" ")).toContain("Create project files");
    }
  });

  it("renders skipped and final states without redrawing prior output", () => {
    ui.skipStep("git-initialized", "not selected");
    ui.finishSteps();

    const output = consoleLogSpy.mock.calls.flat().join(" ");
    expect(output).toContain("Initialize Git repository");
    expect(output).toContain("Scaffold complete");
  });

  it("formats step duration for readable progress output", () => {
    expect(ui.formatDuration(420)).toBe("420ms");
    expect(ui.formatDuration(1_250)).toBe("1.3s");
    expect(ui.formatDuration(12_400)).toBe("12s");
  });
});
