import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { exitCodeFor, formatFindings, runDesignChecks, type DesignFinding } from "../src/checks.js";

const secureTokens = readFileSync(new URL("./fixtures/secure/tokens.json", import.meta.url), "utf8");
const secureDesignMd = readFileSync(new URL("./fixtures/secure/DESIGN.md", import.meta.url), "utf8");
const secureDir = new URL("./fixtures/secure/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const tempDirs: Array<string> = [];
function makeBundle(tokensJson: unknown | string | null, designMd: string | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), "authenik8-design-"));
  tempDirs.push(dir);
  if (tokensJson !== null) {
    writeFileSync(
      path.join(dir, "tokens.json"),
      typeof tokensJson === "string" ? tokensJson : JSON.stringify(tokensJson, null, 2),
    );
  }
  if (designMd !== null) writeFileSync(path.join(dir, "DESIGN.md"), designMd);
  return dir;
}
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tokensWith(mutate: (tokens: Record<string, unknown>) => void): Record<string, unknown> {
  const tokens = JSON.parse(secureTokens) as Record<string, unknown>;
  mutate(tokens);
  return tokens;
}

const findingById = (findings: Array<DesignFinding>, id: string): DesignFinding => {
  const finding = findings.find((entry) => entry.id === id);
  if (!finding) throw new Error(`missing finding ${id}`);
  return finding;
};

describe("design checks — secure fixture", () => {
  it("passes all four checks on a real, honest bundle", async () => {
    const result = await runDesignChecks(secureDir);
    expect(result.ok).toBe(true);
    expect(result.findings.map((finding) => finding.id)).toEqual([
      "A8-DS-001",
      "A8-DS-002",
      "A8-DS-003",
      "A8-DS-004",
    ]);
    for (const finding of result.findings) {
      expect(finding.status, `${finding.id} should pass`).toBe("pass");
    }
  });
});

describe("design checks — A8-DS-001 schema failures", () => {
  it("fails with a stable ID when tokens.json is missing", async () => {
    const result = await runDesignChecks(makeBundle(null, secureDesignMd));
    expect(result.ok).toBe(false);
    const finding = findingById(result.findings, "A8-DS-001");
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("tokens.json not found");
    expect(finding.remediation).toBeTruthy();
  });

  it("fails on invalid JSON and on schema violations", async () => {
    const invalidJson = await runDesignChecks(makeBundle("{ not json", secureDesignMd));
    expect(findingById(invalidJson.findings, "A8-DS-001").message).toContain("not valid JSON");

    const unknownKey = await runDesignChecks(
      makeBundle(tokensWith((tokens) => { tokens.surprise = true; }), secureDesignMd),
    );
    expect(findingById(unknownKey.findings, "A8-DS-001").status).toBe("fail");
  });
});

describe("design checks — A8-DS-002 required groups", () => {
  it("fails when a required group is empty", async () => {
    const result = await runDesignChecks(
      makeBundle(tokensWith((tokens) => {
        (tokens.spacing as { scale: Record<string, string> }).scale = {};
      }), secureDesignMd),
    );
    const finding = findingById(result.findings, "A8-DS-002");
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("spacing.scale");
  });
});

describe("design checks — A8-DS-003 WCAG AA contrast", () => {
  it("fails a pair that misses the body threshold, with ratio and remediation", async () => {
    const result = await runDesignChecks(
      makeBundle(tokensWith((tokens) => {
        const color = tokens.color as { groups: { base: Record<string, string> } };
        color.groups.base.ink = "#777777"; // 4.48:1 on white
        (tokens as Record<string, unknown>).typography = {
          family: "system-ui",
          scale: { md: "16px" },
        };
      }), secureDesignMd),
    );
    const finding = findingById(result.findings, "A8-DS-003");
    expect(finding.status).toBe("fail");
    // #777777 on the dark background (#0B1020) is 4.23:1; on surface, 3.91:1.
    expect(finding.message).toMatch(/4\.23:1/);
    expect(finding.message).toMatch(/below the WCAG AA 4\.5:1 threshold for body/);
    expect(finding.message).toContain("pair 1"); // both declared pairs reported
    expect(finding.remediation).toContain("WCAG 2.1 AA");
  });

  it("fails a pair whose token reference does not resolve", async () => {
    const result = await runDesignChecks(
      makeBundle(tokensWith((tokens) => {
        const color = tokens.color as { contrastPairs: Array<Record<string, string>> };
        color.contrastPairs.push({
          foreground: "color.base.does-not-exist",
          background: "color.base.background",
          kind: "body",
        });
      }), secureDesignMd),
    );
    const finding = findingById(result.findings, "A8-DS-003");
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("does-not-exist");
    expect(finding.message).toContain("does not resolve");
  });
});

describe("design checks — A8-DS-004 DESIGN.md sync", () => {
  it("fails when DESIGN.md references colors missing from tokens.json", async () => {
    const result = await runDesignChecks(
      makeBundle(secureTokens, `${secureDesignMd}\n\nSurprise: #123456\n`),
    );
    const finding = findingById(result.findings, "A8-DS-004");
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("#123456");
    expect(finding.remediation).toBeTruthy();
  });

  it("warns (does not fail) when DESIGN.md is absent", async () => {
    const result = await runDesignChecks(makeBundle(secureTokens, null));
    const finding = findingById(result.findings, "A8-DS-004");
    expect(finding.status).toBe("warn");
    expect(result.ok).toBe(true);
    expect(exitCodeFor(result.findings)).toBe(0);
  });
});

describe("design checks — exit policy and formatting", () => {
  it("maps findings to doctor-style exit codes", () => {
    const warnOnly: Array<DesignFinding> = [
      { id: "A8-DS-004", title: "sync", status: "warn", message: "skipped" },
      { id: "A8-DS-001", title: "schema", status: "pass", message: "ok" },
    ];
    expect(exitCodeFor(warnOnly)).toBe(0);
    expect(exitCodeFor([...warnOnly, {
      id: "A8-DS-003",
      title: "contrast",
      status: "fail",
      message: "4.48:1",
    }])).toBe(1);
  });

  it("formats findings with marks, IDs, and a fix line for failures", async () => {
    const result = await runDesignChecks(makeBundle("{ not json", null));
    const text = formatFindings(result);
    expect(text).toContain("✗ A8-DS-001");
    expect(text).toContain("fix:");
    expect(text).toContain("design checks failed");
  });
});
