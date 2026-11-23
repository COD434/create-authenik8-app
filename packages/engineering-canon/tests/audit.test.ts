import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditProject,
  canonFingerprint,
  createCanonBaseline,
  formatCanonFindings,
  parseCanonBaseline,
  stripCommentsAndStrings,
} from "../src/audit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");
const temporaryDirectories: string[] = [];

async function temporaryProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "a8-canon-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }).catch(() => undefined),
    ),
  );
});

function rules(result: Awaited<ReturnType<typeof auditProject>>): string[] {
  return result.findings.map((finding) => finding.rule);
}

describe("canon audit", () => {
  it("passes a clean source tree", async () => {
    const result = await auditProject(path.join(fixtures, "clean"));
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it("reports the high-signal violations with stable rule IDs", async () => {
    const result = await auditProject(path.join(fixtures, "violations"));
    expect(result.ok).toBe(false);
    const found = rules(result);
    expect(found).toContain("A8-ARCH-12");
    expect(found).toContain("A8-TS-01");
    expect(found).toContain("A8-REL-05");
    expect(found).toContain("A8-SEC-02");
    expect(found).toContain("A8-SEC-04");
    expect(found).toContain("A8-SEC-05");
    expect(found).toContain("A8-SEC-06");
    expect(found).toContain("A8-SEC-08");
    expect(found).toContain("A8-DATA-07");
  });

  it("treats medium findings as non-blocking unless strict", async () => {
    const directory = await temporaryProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    const lines = ["export function long(): number {", "  let total = 0;"];
    for (let index = 0; index < 70; index++) lines.push(`  total += ${index};`);
    lines.push("  return total;", "}", "");
    await writeFile(path.join(directory, "src", "long.ts"), lines.join("\n"), "utf8");

    const normal = await auditProject(directory);
    expect(normal.ok).toBe(true);
    expect(rules(normal)).toContain("A8-READ-01");

    const strict = await auditProject(directory, { strict: true });
    expect(strict.ok).toBe(false);
  });

  it("excludes reviewed baseline entries without hiding new findings", async () => {
    const directory = await temporaryProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    const oversized = ["export function long(): number {", "  let total = 0;"];
    for (let index = 0; index < 70; index++) oversized.push(`  total += ${index};`);
    oversized.push("  return total;", "}", "");
    await writeFile(path.join(directory, "src", "long.ts"), oversized.join("\n"), "utf8");

    const initial = await auditProject(directory);
    const baseline = new Set(initial.findings.map(canonFingerprint));
    const accepted = await auditProject(directory, { baseline });
    expect(accepted.ok).toBe(true);
    expect(accepted.findings).toEqual([]);
    expect(accepted.baselined).toBe(initial.findings.length);

    await writeFile(path.join(directory, "src", "any.ts"), "export const value: any = 1;\n", "utf8");
    const regression = await auditProject(directory, { baseline });
    expect(regression.ok).toBe(false);
    expect(rules(regression)).toContain("A8-TS-01");
    expect(regression.baselined).toBe(initial.findings.length);
  });

  it("round-trips a baseline and rejects malformed entries", () => {
    const finding = {
      rule: "A8-TS-01",
      severity: "high" as const,
      file: "src/a.ts",
      line: 3,
      message: "explicit any escapes the type system",
      fix: "Type the value or parse it at the boundary.",
    };
    const document = createCanonBaseline([finding]);
    expect(parseCanonBaseline(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(() => parseCanonBaseline({ version: 1, findings: [{}] })).toThrow(/rule, file, and message/);
    expect(
      canonFingerprint({ ...finding, message: "file is 10 lines" }),
    ).toBe(canonFingerprint({ ...finding, message: "file is 99 lines" }));
  });

  it("treats a documented non-critical catch as low severity", async () => {
    const directory = await temporaryProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(
      path.join(directory, "src", "best-effort.ts"),
      [
        "export function remember(value: string): void {",
        "  try {",
        '    window.localStorage.setItem("key", value);',
        "  } catch {",
        "    // Storage can be blocked; the in-memory value is still usable.",
        "  }",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await auditProject(directory);
    expect(result.ok).toBe(true);
    const finding = result.findings.find((entry) => entry.rule === "A8-REL-05");
    expect(finding?.severity).toBe("low");
    expect(finding?.message).toContain("documented");

    const strict = await auditProject(directory, { strict: true });
    expect(strict.ok).toBe(false);
  });

  it("flags dynamic HTML sinks but not static markup", async () => {
    const directory = await temporaryProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(
      path.join(directory, "src", "sink.ts"),
      [
        'const STATIC = "<svg></svg>";',
        "export function render(host: HTMLElement, html: string): void {",
        "  host.innerHTML = STATIC;",
        '  host.innerHTML = "";',
        "  host.innerHTML = html;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await auditProject(directory);
    const sinks = result.findings.filter((entry) => entry.rule === "A8-SEC-08");
    expect(sinks).toHaveLength(1);
    expect(sinks[0]?.line).toBe(5);
  });

  it("honors a line-level canon-ignore for a verified false positive", async () => {
    const directory = await temporaryProject();
    await mkdir(path.join(directory, "src"), { recursive: true });
    await writeFile(
      path.join(directory, "src", "trusted.ts"),
      [
        "export function render(host: HTMLElement, trustedHtml: string): void {",
        "  host.innerHTML = trustedHtml; // canon-ignore A8-SEC-08: sanitized upstream",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await auditProject(directory);
    expect(result.findings.filter((entry) => entry.rule === "A8-SEC-08")).toEqual([]);
  });

  it("skips node_modules and build output", async () => {
    const directory = await temporaryProject();
    await mkdir(path.join(directory, "node_modules", "bad"), { recursive: true });
    await writeFile(
      path.join(directory, "node_modules", "bad", "index.ts"),
      "export const value: any = 1;\n",
      "utf8",
    );
    const result = await auditProject(directory);
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("formats findings with severity, rule, location, and fix", async () => {
    const result = await auditProject(path.join(fixtures, "violations"));
    const text = formatCanonFindings(result);
    expect(text).toContain("canon audit:");
    expect(text).toContain("[critical] A8-SEC-04");
    expect(text).toContain("  fix:");
  });
});

describe("source stripping", () => {
  it("removes comments and string contents while preserving line numbers", () => {
    const source = [
      "const a = \"any\"; // : any",
      "/* : any */",
      "const b: number = 1;",
    ].join("\n");
    const stripped = stripCommentsAndStrings(source);
    expect(stripped).not.toContain("any");
    expect(stripped.split("\n")).toHaveLength(3);
  });
});
