import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { executeTool, resolveInsideSandbox } from "../src/tools.js";

let sandbox: string;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "a8-sandbox-"));
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true }).catch(() => {});
});

describe("resolveInsideSandbox", () => {
  it("accepts plain relative paths", () => {
    expect(resolveInsideSandbox(sandbox, "src/index.ts")).toBe(path.resolve(sandbox, "src/index.ts"));
  });

  it("rejects parent traversal, absolute, drive-rooted, and root forms", () => {
    expect(resolveInsideSandbox(sandbox, "../escape.txt")).toBeNull();
    expect(resolveInsideSandbox(sandbox, "..\\escape.txt")).toBeNull();
    expect(resolveInsideSandbox(sandbox, "C:\\outside.txt")).toBeNull();
    expect(resolveInsideSandbox(sandbox, "/etc/passwd")).toBeNull();
    expect(resolveInsideSandbox(sandbox, ".")).toBeNull();
  });
});

describe("executeTool", () => {
  it("writes and reads files inside the sandbox", async () => {
    const write = await executeTool(
      "write_file",
      JSON.stringify({ path: "src/app.ts", content: "console.log(1);" }),
      sandbox,
    );
    expect(write.ok).toBe(true);
    expect(await readFile(path.join(sandbox, "src", "app.ts"), "utf8")).toBe("console.log(1);");

    const read = await executeTool("read_file", JSON.stringify({ path: "src/app.ts" }), sandbox);
    expect(read.ok).toBe(true);
    expect(read.result).toBe("console.log(1);");
  });

  it("lists files as relative paths and skips node_modules", async () => {
    await mkdir(path.join(sandbox, "node_modules"), { recursive: true });
    await writeFile(path.join(sandbox, "node_modules", "junk.js"), "x", "utf8");
    const list = await executeTool("list_files", "{}", sandbox);
    expect(list.ok).toBe(true);
    const parsed = JSON.parse(list.result) as { files: string[] };
    expect(parsed.files).toContain(path.join("src", "app.ts"));
    expect(parsed.files.some((file) => file.includes("node_modules"))).toBe(false);
  });

  it("refuses to write outside the sandbox", async () => {
    const outcome = await executeTool(
      "write_file",
      JSON.stringify({ path: "../escaped.txt", content: "no" }),
      sandbox,
    );
    expect(outcome.ok).toBe(false);
    await expect(readFile(path.resolve(sandbox, "../escaped.txt"))).rejects.toThrow();
  });

  it("rejects invalid JSON arguments, schema violations, and unknown tools", async () => {
    expect((await executeTool("write_file", "{not json", sandbox)).ok).toBe(false);
    expect((await executeTool("read_file", "{}", sandbox)).ok).toBe(false);
    expect((await executeTool("delete_everything", "{}", sandbox)).ok).toBe(false);
  });

  it("caps oversized content before writing", async () => {
    const outcome = await executeTool(
      "write_file",
      JSON.stringify({ path: "big.txt", content: "x".repeat(270_000) }),
      sandbox,
    );
    expect(outcome.ok).toBe(false);
  });

  it("truncates oversized tool results fed back to the model", async () => {
    await executeTool(
      "write_file",
      JSON.stringify({ path: "big2.txt", content: "y".repeat(20_000) }),
      sandbox,
    );
    const read = await executeTool("read_file", JSON.stringify({ path: "big2.txt" }), sandbox);
    expect(read.result.length).toBeLessThanOrEqual(16_020);
    expect(read.result).toContain("[truncated]");
  });
});
