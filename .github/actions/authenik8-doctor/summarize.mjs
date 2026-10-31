#!/usr/bin/env node
// Renders a create-authenik8-app Doctor JSON report as deterministic Markdown
// for GitHub job summaries and pull-request comments. Read-only: the script
// reads exactly one report file argument and prints exactly one Markdown
// block. It never prints environment values, file contents, or anything that
// is not part of the schema-versioned report or the given exit code.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Escapes a value for one Markdown table cell. Only the report's own
 * metadata, labels, and messages can reach this function.
 */
function cell(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

/**
 * Builds the Markdown block for one report.
 * @param {unknown} report parsed JSON report (schemaVersion 1) or null
 * @param {number} exitCode the Doctor process exit code
 * @returns {string}
 */
export function buildDoctorSummary(report, exitCode) {
  const usable = report !== null
    && typeof report === "object"
    && report.schemaVersion === 1
    && Array.isArray(report.checks)
    && report.summary !== null
    && typeof report.summary === "object"
    && isFiniteNumber(report.summary.passed)
    && isFiniteNumber(report.summary.failed)
    && isFiniteNumber(report.summary.warnings)
    && isFiniteNumber(report.summary.skipped);

  if (!usable) {
    return [
      "## Authenik8 Doctor",
      "",
      "![Authenik8 Doctor](https://img.shields.io/badge/authenik8%20doctor-no%20report-red)",
      "",
      "No schema-versioned Doctor report was produced. Check the job logs;",
      "the action fails closed.",
      "",
    ].join("\n");
  }

  const summary = report.summary;
  const counts = summary.passed + summary.warnings + summary.failed + summary.skipped;
  const badgeStatus = summary.failed > 0
    ? "failing"
    : summary.warnings > 0
      ? "passing%20with%20warnings"
      : "passing";
  const badgeColor = summary.failed > 0
    ? "red"
    : summary.warnings > 0
      ? "yellow"
      : "brightgreen";

  const findings = report.checks.filter(
    (item) => item !== null
      && typeof item === "object"
      && (item.status === "fail" || item.status === "warn"),
  );

  const lines = [
    "## Authenik8 Doctor",
    "",
    `![Authenik8 Doctor](https://img.shields.io/badge/authenik8%20doctor-${badgeStatus}-${badgeColor})`,
    "",
    `Mode \`${report.mode}\` · preset \`${report.preset}\` · read-only run.`,
    "",
  ];

  if (findings.length === 0) {
    lines.push("All executed diagnostics passed.", "");
  } else {
    lines.push(
      "| Status | Check | Diagnostic | Message |",
      "| --- | --- | --- | --- |",
    );
    for (const item of findings) {
      const symbol = item.status === "fail" ? "!" : "-";
      lines.push(
        `| ${symbol} ${item.status} | ${cell(item.label)} | \`${cell(item.id)}\` | ${cell(item.message)} |`,
      );
    }
    lines.push("");
    lines.push(
      "Explain any of these diagnostics without touching the project:",
      "",
      "```bash",
      `npx create-authenik8-app@latest doctor --explain ${cell(findings[0].id)}`,
      "```",
      "",
    );
  }

  lines.push(
    `${counts} checks ran: ${summary.passed} passed · `
    + `${summary.warnings} warnings · ${summary.failed} failed · `
    + `${summary.skipped} skipped — doctor exit code ${exitCode}.`,
    "",
  );
  return lines.join("\n");
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function readReport(path) {
  try {
    // Windows redirections (PowerShell>) may emit a UTF-8 BOM; JSON.parse
    // rejects it. The report content is never user-secret material.
    const source = readFileSync(path, "utf8");
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function main() {
  const reportPath = process.argv[2];
  const rawExitCode = Number(process.argv[3]);
  const exitCode = Number.isFinite(rawExitCode) ? rawExitCode : 1;
  const report = reportPath ? readReport(reportPath) : null;
  process.stdout.write(buildDoctorSummary(report, exitCode) + "\n");
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]).href);

if (invokedDirectly) {
  main();
}
