import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/process.js");

import {
  detectPackageManager,
  getInstallArgs,
  installDependencies,
  isPackageManagerAvailable,
  resolvePackageManagerForPreset,
  getProjectInstallEnv,
} from "../../src/steps/installDeps.js";
import * as processLib from "../../src/lib/process.js";


describe("getProjectInstallEnv", () => {
  it("removes inherited npm allow-scripts configuration", () => {
    const result = getProjectInstallEnv({
      PATH: "/usr/bin",
      HOME: "/home/test",
      npm_config_allow_scripts: "create-authenik8-app",
    });

    expect(result).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/test",
    });
  });

  it("removes the setting case-insensitively", () => {
    const result = getProjectInstallEnv({
      PATH: "/usr/bin",
      NPM_CONFIG_ALLOW_SCRIPTS: "create-authenik8-app",
    });

    expect(result).toEqual({
      PATH: "/usr/bin",
    });
  });

  it("does not mutate the original environment", () => {
    const original = {
      PATH: "/usr/bin",
      npm_config_allow_scripts: "create-authenik8-app",
    };

    getProjectInstallEnv(original);

    expect(original.npm_config_allow_scripts).toBe(
      "create-authenik8-app",
    );
  });
});


describe("dependency installation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processLib.getCommand).mockImplementation((command) => command);
    vi.mocked(processLib.run).mockResolvedValue(undefined);
    vi.mocked(processLib.commandExists).mockReturnValue(true);
  });

  it.each([
    [{ npm_config_user_agent: "pnpm/10.0.0 npm/? node/v22" }, "pnpm"],
    [{ npm_config_user_agent: "bun/1.2.0 npm/? node/v22" }, "bun"],
    [{ npm_config_user_agent: "npm/11.0.0 node/v24" }, "npm"],
    [{ npm_execpath: "C:\\tools\\pnpm.cjs" }, "pnpm"],
    [{}, "npm"],
  ] as const)("detects the invoking package manager from %o", (env, expected) => {
    expect(detectPackageManager(env)).toBe(expected);
  });

  it("does not probe unrelated package managers during detection", () => {
    expect(detectPackageManager({})).toBe("npm");
    expect(processLib.commandExists).not.toHaveBeenCalled();
  });

  it("keeps the fullstack preset on npm workspaces", () => {
    expect(resolvePackageManagerForPreset("fullstack", undefined, {
      npm_config_user_agent: "pnpm/11.0.0",
    })).toBe("npm");
    expect(() => resolvePackageManagerForPreset("fullstack", "pnpm")).toThrow(
      "full-stack preset uses npm workspaces",
    );
  });

  it("honors an explicit manager for Express presets", () => {
    expect(resolvePackageManagerForPreset("auth", "bun")).toBe("bun");
  });

  it.each([
    ["npm", ["install", "--prefer-offline", "--no-audit", "--no-fund", "--progress=false", "--no-update-notifier"]],
    ["pnpm", ["install", "--prefer-offline", "--reporter=append-only"]],
    ["bun", ["install", "--no-progress"]],
  ] as const)("uses cache-aware %s install arguments", (manager, expected) => {
    expect(getInstallArgs(manager)).toEqual(expected);
  });

  it.each(["npm", "pnpm", "bun"] as const)("installs with %s and returns timing metadata", async (manager) => {
    const result = await installDependencies("/tmp/test-project", manager);

    expect(processLib.run).toHaveBeenCalledWith(
      manager,
      getInstallArgs(manager),
      { cwd: "/tmp/test-project",
	stdio: "inherit", 
	env: expect.any(Object) 
      },
    );
    expect(result).toMatchObject({ packageManager: manager });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("checks explicit package-manager availability", () => {
    vi.mocked(processLib.commandExists).mockReturnValue(false);
    expect(isPackageManagerAvailable("pnpm")).toBe(false);
    expect(processLib.commandExists).toHaveBeenCalledWith("pnpm");
  });

  it("preserves install failures and interrupt handling", async () => {
    const error = new Error("registry unavailable");
    vi.mocked(processLib.run).mockRejectedValueOnce(error);

    await expect(installDependencies("/tmp/test-project", "npm")).rejects.toThrow(
      "registry unavailable",
    );
    expect(processLib.exitForInterrupt).toHaveBeenCalledWith(error);
  });
});
