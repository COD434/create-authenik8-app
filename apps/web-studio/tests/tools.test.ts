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

const PASSING_TOKENS = {
  schemaVersion: 1,
  name: "Studio Test",
  color: {
    groups: { brand: { bg: "#0B1020", fg: "#F5F7FA" } },
    contrastPairs: [{ foreground: "color.brand.fg", background: "color.brand.bg", kind: "body" }],
  },
  typography: { family: "Inter", scale: { body: "16px" } },
  spacing: { scale: { md: "16px" } },
};

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

describe("design_audit tool", () => {
  it("passes a valid bundle and reports the A8-DS checks", async () => {
    await mkdir(path.join(sandbox, "design"), { recursive: true });
    await writeFile(
      path.join(sandbox, "design", "tokens.json"),
      JSON.stringify(PASSING_TOKENS),
      "utf8",
    );
    const outcome = await executeTool("design_audit", "{}", sandbox);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toContain("A8-DS-001");
    expect(outcome.result).toContain("A8-DS-003");
    expect(outcome.result).toContain("design checks passed");
  });

  it("fails a low-contrast bundle with remediation the model can act on", async () => {
    const failing = structuredClone(PASSING_TOKENS);
    failing.color.groups.brand.fg = "#999999";
    failing.color.groups.brand.bg = "#FFFFFF";
    await writeFile(
      path.join(sandbox, "design", "tokens.json"),
      JSON.stringify(failing),
      "utf8",
    );
    const outcome = await executeTool("design_audit", "{}", sandbox);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain("A8-DS-003");
    expect(outcome.result).toContain("fix:");
    expect(outcome.result).toContain("design checks failed");
  });

  it("reports a missing bundle as an A8-DS-001 failure, not a crash", async () => {
    await mkdir(path.join(sandbox, "empty-design"), { recursive: true });
    const outcome = await executeTool(
      "design_audit",
      JSON.stringify({ path: "empty-design" }),
      sandbox,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain("A8-DS-001");
    expect(outcome.result).toContain("tokens.json not found");
  });

  it("refuses design directories outside the sandbox", async () => {
    const outcome = await executeTool(
      "design_audit",
      JSON.stringify({ path: "../../elsewhere" }),
      sandbox,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain("escapes the project sandbox");
  });
});
