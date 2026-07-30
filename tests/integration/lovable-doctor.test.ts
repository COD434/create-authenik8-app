import fs from "fs-extra";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateProjectFixture, type GeneratedProject } from "../helpers/generator.js";

describe("generated Lovable Doctor", () => {
  let generated: GeneratedProject | undefined;

  afterEach(async () => {
    await generated?.cleanup();
    generated = undefined;
  });

  it("passes the included React reference and emits stable JSON", async () => {
    generated = await generateProjectFixture({ template: "fullstack", frontend: "lovable" });
    const module = await import(pathToFileURL(
      path.join(generated.targetDir, "scripts/doctor-lovable.mjs"),
    ).href);
    const output: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
      output.push(String(value));
      return true;
    });
    const result = await module.runLovableDoctor([generated.targetDir, "--json"]);
    write.mockRestore();

    expect(result.summary.failed).toBe(0);
    const report = JSON.parse(output.join(""));
    expect(report.certification).toBe(false);
    expect(report.summary.failed).toBe(0);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "AUTHK8-LOV-001", status: "PASS" }),
      expect.objectContaining({ id: "AUTHK8-LOV-010", status: "PASS" }),
    ]));
  });

  it("fails deliberately insecure generated frontend code with file and line details", async () => {
    generated = await generateProjectFixture({ template: "fullstack", frontend: "lovable" });
    const insecure = path.join(generated.rootDir, "insecure-frontend");
    await fs.ensureDir(path.join(insecure, "src"));
    await fs.writeFile(
      path.join(insecure, ".env.example"),
      "VITE_AUTHENIK8_API_URL=https://api.example.com/private\n",
    );
    await fs.writeFile(
      path.join(insecure, "src/app.ts"),
      [
        'import { createClient } from "@supabase/supabase-js";',
        'localStorage.setItem("accessToken", "unsafe");',
        'const role = localStorage.getItem("role");',
        'fetch("/api/auth/refresh");',
        'const config = { DATABASE_URL: "postgres://public" };',
        'export { createClient, role, config };',
        "",
      ].join("\n"),
    );

    const module = await import(pathToFileURL(
      path.join(generated.targetDir, "scripts/doctor-lovable.mjs"),
    ).href);
    const output: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
      output.push(String(value));
      return true;
    });
    const result = await module.runLovableDoctor([insecure, "--json"]);
    write.mockRestore();
    process.exitCode = undefined;

    expect(result.summary.failed).toBeGreaterThanOrEqual(5);
    const report = JSON.parse(output.join(""));
    expect(report.summary.failed).toBeGreaterThanOrEqual(5);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "AUTHK8-LOV-001",
        status: "FAIL",
        file: "src/app.ts",
        line: 2,
      }),
      expect.objectContaining({ id: "AUTHK8-LOV-002", status: "FAIL" }),
      expect.objectContaining({ id: "AUTHK8-LOV-004", status: "FAIL" }),
      expect.objectContaining({ id: "AUTHK8-LOV-005", status: "FAIL" }),
      expect.objectContaining({ id: "AUTHK8-LOV-012", status: "FAIL" }),
    ]));
  });
});
