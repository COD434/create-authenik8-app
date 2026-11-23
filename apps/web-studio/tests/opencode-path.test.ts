import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveOpenCodePath } from "../src/opencode-path.js";

describe("opencode path resolution", () => {
  const makeFile = async (file: string): Promise<string> => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "placeholder", "utf8");
    return file;
  };

  it("honors an explicit OPENCODE_PATH that exists", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "a8-oc-"));
    const exe = await makeFile(path.join(home, "custom", "opencode.exe"));
    expect(resolveOpenCodePath({ OPENCODE_PATH: exe }, home, "win32")).toBe(exe);
  });

  it("does not hand out a nonexistent OPENCODE_PATH (it would spawn-fail silently)", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "a8-oc-"));
    const exe = await makeFile(path.join(home, ".opencode", "bin", "opencode.exe"));
    expect(resolveOpenCodePath({ OPENCODE_PATH: "Z:\\definitely\\missing\\opencode.exe" }, home, "win32")).toBe(exe);
  });

  it("resolves the npm global @opencode/cli layout on Windows", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "a8-oc-"));
    const appData = path.join(home, "AppData", "Roaming");
    const exe = await makeFile(path.join(appData, "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe"));
    expect(resolveOpenCodePath({ APPDATA: appData }, home, "win32")).toBe(exe);
  });

  it("falls back to the ~/.opencode/bin installer layout on Windows", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "a8-oc-"));
    const exe = await makeFile(path.join(home, ".opencode", "bin", "opencode.exe"));
    expect(resolveOpenCodePath({}, home, "win32")).toBe(exe);
  });

  it("returns null on Windows when no candidate exists (fail closed with UI guidance)", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "a8-oc-"));
    expect(resolveOpenCodePath({}, home, "win32")).toBeNull();
  });

  it("resolves the POSIX installer binary and returns null without one (PATH default)", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "a8-oc-"));
    expect(resolveOpenCodePath({}, home, "linux")).toBeNull();
    const bin = await makeFile(path.join(home, ".opencode", "bin", "opencode"));
    expect(resolveOpenCodePath({}, home, "linux")).toBe(bin);
  });
});
