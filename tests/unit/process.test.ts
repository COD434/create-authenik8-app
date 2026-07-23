import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync } from "child_process";
import * as processLib from "../../src/lib/process.js";

vi.mock("child_process");

function mockChild(pid = 1234) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("cross-platform process execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    processLib.killAllProcesses("linux");
  });

  it("resolves platform executable names without mutating process.platform", () => {
    expect(processLib.getCommand("npm", "win32")).toBe("npm.cmd");
    expect(processLib.getCommand("npx", "win32")).toBe("npx.cmd");
    expect(processLib.getCommand("pnpm", "win32")).toBe("pnpm.cmd");
    expect(processLib.getCommand("bun", "win32")).toBe("bun.exe");
    expect(processLib.getCommand("git", "win32")).toBe("git.exe");
    expect(processLib.getCommand("npm", "darwin")).toBe("npm");
    expect(processLib.getCommand("node", "linux")).toBe("node");
  });

  it("runs commands with hidden Windows consoles and no Unix shell", async () => {
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = processLib.run("npm", ["install"], { cwd: "/tmp/project" });
    child.emit("close", 0, null);

    await expect(promise).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith("npm", ["install"], {
      cwd: "/tmp/project",
      stdio: "ignore",
      env: undefined,
      shell: process.platform === "win32",
<<<<<<< HEAD
      detached: process.platform !== "win32",
=======
>>>>>>> main
      windowsHide: true,
    });
  });

  it("captures buffered output and includes it in failures", async () => {
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = processLib.run("npm", ["install"], {
      cwd: "/tmp/project",
      stdio: "pipe",
    });
    child.stderr.emit("data", "registry request failed");
    child.emit("close", 1, null);

    await expect(promise).rejects.toThrow("registry request failed");
  });

  it("preserves interrupt signals", async () => {
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = processLib.run("npm", ["install"], { cwd: "/tmp/project" });
    child.emit("close", null, "SIGINT");

    await expect(promise).rejects.toMatchObject({ signal: "SIGINT" });
  });

  it("rejects executable spawn errors", async () => {
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child as never);
    const error = Object.assign(new Error("not found"), { code: "ENOENT" });

    const promise = processLib.run("git", ["init"], { cwd: "/tmp/project" });
    child.emit("error", error);

    await expect(promise).rejects.toBe(error);
    expect(processLib.isCommandNotFoundError(error)).toBe(true);
  });

  it("probes commands with the correct Windows shell behavior", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);

    expect(processLib.commandExists("npm", "win32")).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith("npm.cmd", ["--version"], {
      stdio: "ignore",
      shell: true,
      windowsHide: true,
    });
  });

  it("returns false when an executable probe fails", () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: null,
      error: new Error("missing"),
    } as never);
    expect(processLib.commandExists("bun", "darwin")).toBe(false);
  });

  it("checks the Docker Compose plugin instead of only the Docker executable", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);

    expect(processLib.dockerComposeAvailable("win32")).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith("docker", ["compose", "version"], {
      stdio: "ignore",
      shell: true,
      windowsHide: true,
    });
  });

  it("checks whether the Docker daemon is reachable", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);

    expect(processLib.dockerDaemonAvailable("win32")).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith(
      "docker",
      ["info", "--format", "{{.ServerVersion}}"],
      {
        stdio: "ignore",
        shell: true,
        windowsHide: true,
      },
    );
  });

  it("terminates child trees with taskkill on Windows", async () => {
    const child = mockChild(9876);
    vi.mocked(spawn).mockReturnValue(child as never);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);

    const promise = processLib.run("npm.cmd", ["install"], { cwd: "C:\\project" });
    processLib.killAllProcesses("win32");
    child.emit("close", 0, null);
    await promise;

    expect(spawnSync).toHaveBeenCalledWith(
      "taskkill.exe",
      ["/pid", "9876", "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
  });

<<<<<<< HEAD
  it("terminates the entire child process group on Unix", async () => {
    const child = mockChild(9876);
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = processLib.run("npm", ["install"], { cwd: "/tmp/project" });
    processLib.killAllProcesses("linux");
    child.emit("close", 0, null);
    await promise;

    expect(kill).toHaveBeenCalledWith(-9876, "SIGTERM");
    expect(child.kill).not.toHaveBeenCalled();
  });

=======
>>>>>>> main
  it("classifies only supported interrupt signals", async () => {
    expect(processLib.isInterruptedError({ signal: "SIGINT" })).toBe(true);
    expect(processLib.isInterruptedError({ signal: "SIGTERM" })).toBe(true);
    expect(processLib.isInterruptedError({ signal: "SIGKILL" })).toBe(false);
    await expect(processLib.exitForInterrupt({ signal: "SIGINT" })).rejects.toEqual({
      signal: "SIGINT",
    });
    await expect(processLib.exitForInterrupt(new Error("normal"))).resolves.toBeUndefined();
  });
});
