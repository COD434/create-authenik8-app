import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("browser token storage rule", () => {
  it("keeps the generated API client free of browser storage APIs", async () => {
    const source = await readFile(path.resolve(process.cwd(), "../../packages/api-client/src/index.ts"), "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(source).toContain("let accessToken: string | null = null");
    expect(source).toContain('credentials: "include"');
  });
});
