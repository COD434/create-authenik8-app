import chalk from "chalk";

import type { DoctorCheck, DoctorReport } from "./types.js";

const statusSymbol: Record<DoctorCheck["status"], string> = {
  pass: "✓",
  warn: "!",
  fail: "×",
};

function colorStatus(check: DoctorCheck): string {
  const symbol = statusSymbol[check.status];
  if (check.status === "pass") return chalk.green(symbol);
  if (check.status === "warn") return chalk.yellow(symbol);
  return chalk.red(symbol);
}

export function formatDoctorReport(report: DoctorReport, json: boolean): string {
  if (json) return `${JSON.stringify(report, null, 2)}\n`;

  const lines = [
    chalk.bold("\nAuthenik8 doctor"),
    chalk.dim(`${report.preset} · ${report.rootDir}`),
    "",
  ];
  for (const item of report.checks) {
    lines.push(`${colorStatus(item)} ${chalk.bold(item.label)}: ${item.message}`);
    if (item.fix) lines.push(`  ${chalk.dim(`Fix: ${item.fix}`)}`);
  }
  lines.push(
    "",
    report.summary.failed > 0
      ? chalk.red(`${report.summary.failed} failed, ${report.summary.warnings} warnings, ${report.summary.passed} passed`)
      : report.summary.warnings > 0
        ? chalk.yellow(`${report.summary.passed} passed with ${report.summary.warnings} warnings`)
        : chalk.green(`All ${report.summary.passed} checks passed`),
    "",
  );
  return lines.join("\n");
}

export function doctorHelp(): string {
  return `
AUTHENIK8 DOCTOR
Validate a generated project's auth configuration and local services

Usage:
  create-authenik8-app doctor [directory] [options]

Options:
  --json             Print a machine-readable report
  --skip-services    Skip live Redis checks (useful in CI)
  -h, --help         Show this help message

Examples:
  npx create-authenik8-app doctor
  npx create-authenik8-app doctor ./my-app --json
`;
}
