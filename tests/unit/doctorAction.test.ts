import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildDoctorSummary } from "../../.github/actions/authenik8-doctor/summarize.mjs";

const scriptPath = fileURLToPath(
  new URL("../../.github/actions/authenik8-doctor/summarize.mjs", import.meta.url),
);

function reportFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    rootDir: "/tmp/demo-app",
    preset: "auth",
    mode: "production",
    checks: [
      { id: "A8-PROD-001", label: "Production runtime", status: "pass", message: "NODE_ENV is production" },
      { id: "A8-PROD-002", label: "Production Redis", status: "fail", message: "memory:// does not pass | the production gate" },
      { id: "A8-PROD-003", label: "Production origins", status: "warn", message: "Issuer origin needs review" },
    ],
    summary: { passed: 1, warnings: 1, failed: 1, skipped: 0 },
  };
}

describe("authenik8 doctor action summary", () => {
  it("renders failing findings with a red badge and an explain pointer", () => {
    const output = buildDoctorSummary(reportFixture(), 1);

    expect(output).toContain(
      "![Authenik8 Doctor](https://img.shields.io/badge/authenik8%20doctor-failing-red)",
    );
    expect(output).toContain(
      "| ! fail | Production Redis | `A8-PROD-002` | memory:// does not pass \\| the production gate |",
    );
    expect(output).toContain("| - warn | Production origins | `A8-PROD-003` | Issuer origin needs review |");
    expect(output).not.toContain("NODE_ENV is production");
    expect(output).toContain("npx create-authenik8-app@latest doctor --explain A8-PROD-002");
    expect(output).toContain(
      "3 checks ran: 1 passed · 1 warnings · 1 failed · 0 skipped — doctor exit code 1.",
    );
  });

  it("renders a clean report with a green badge and no findings table", () => {
    const clean = {
      ...reportFixture(),
      checks: [
        { id: "A8-PROD-001", label: "Production runtime", status: "pass", message: "NODE_ENV is production" },
        { id: "A8-SKIP-001", label: "Session probe", status: "skip", message: "not executed" },
      ],
      summary: { passed: 1, warnings: 0, failed: 0, skipped: 1 },
    };

    const output = buildDoctorSummary(clean, 0);

    expect(output).toContain("authenik8%20doctor-passing-brightgreen");
    expect(output).toContain("All executed diagnostics passed.");
    expect(output).not.toContain("| Status |");
    expect(output).toContain(
      "2 checks ran: 1 passed · 0 warnings · 0 failed · 1 skipped — doctor exit code 0.",
    );
  });

  it("falls back to no report when the report is unusable", () => {
    const output = buildDoctorSummary({ nope: true }, 3);

    expect(output).toContain("authenik8%20doctor-no%20report-red");
    expect(output).toContain("fails closed");
  });

  it("supports the CLI entry the composite action invokes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "authenik8-doctor-action-"));
    try {
      const reportPath = path.join(dir, "authenik8-doctor.json");
      await writeFile(reportPath, JSON.stringify(reportFixture()), "utf8");

      const stdout = execFileSync(
        process.execPath,
        [scriptPath, reportPath, "1"],
        { encoding: "utf8" },
      );
      expect(stdout).toContain("authenik8%20doctor-failing-red");

      const missing = execFileSync(
        process.execPath,
        [scriptPath, path.join(dir, "absent.json"), "1"],
        { encoding: "utf8" },
      );
      expect(missing).toContain("no%20report-red");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
