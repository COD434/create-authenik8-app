import chalk from "chalk";

import type { DiagnosticDefinition } from "./catalog.js";
import type {
  DoctorCheck,
  DoctorFixResult,
  DoctorReport,
} from "./types.js";

const statusSymbol: Record<DoctorCheck["status"], string> = {
  pass: "✓",
  warn: "!",
  fail: "×",
  skip: "-",
};

function colorStatus(check: DoctorCheck, color: boolean): string {
  const symbol = statusSymbol[check.status];
  if (!color) return symbol;
  if (check.status === "pass") return chalk.green(symbol);
  if (check.status === "warn") return chalk.yellow(symbol);
  if (check.status === "skip") return chalk.dim(symbol);
  return chalk.red(symbol);
}

export function formatDoctorReport(
  report: DoctorReport,
  json: boolean,
  ci = false,
  supportReportPath?: string,
): string {
  if (json) {
    return `${JSON.stringify({
      ...report,
      ...(supportReportPath ? { supportReport: supportReportPath } : {}),
    }, null, 2)}\n`;
  }

  const color = !ci;
  const bold = (value: string) => color ? chalk.bold(value) : value;
  const dim = (value: string) => color ? chalk.dim(value) : value;
  const lines = [
    bold("\nAuthenik8 doctor"),
    dim(`${report.preset} · ${report.rootDir} · ${report.mode}`),
    "",
  ];
  for (const item of report.checks) {
    lines.push(
      `${colorStatus(item, color)} ${bold(item.label)} [${item.id}]: ${item.message}`,
    );
    if (item.impact) lines.push(`  ${dim(`Impact: ${item.impact}`)}`);
    if (item.remediation) {
      lines.push(`  ${dim(`Remediation: ${item.remediation}`)}`);
    } else if (item.fix) {
      lines.push(`  ${dim(`Fix: ${item.fix}`)}`);
    }
    if (item.verification) {
      lines.push(`  ${dim(`Verify: ${item.verification}`)}`);
    }
  }
  if (report.fixes?.length) {
    lines.push("", bold("Fix plan"));
    for (const fix of report.fixes) {
      lines.push(
        `${fix.status === "applied" ? "✓" : fix.status === "planned" ? "-" : "!"} `
        + `${fix.id} (${fix.classification}, ${fix.status}): ${fix.description}`,
      );
    }
  }
  const summary = `${report.summary.failed} failed, `
    + `${report.summary.warnings} warnings, `
    + `${report.summary.skipped} skipped, `
    + `${report.summary.passed} passed`;
  lines.push(
    "",
    report.summary.failed > 0
      ? color ? chalk.red(summary) : summary
      : report.summary.warnings > 0
        ? color ? chalk.yellow(summary) : summary
        : color ? chalk.green(summary) : summary,
    ...(supportReportPath
      ? ["", `Support report: ${supportReportPath}`]
      : []),
    "",
  );
  return lines.join("\n");
}

export function formatDiagnosticExplanation(
  definition: DiagnosticDefinition,
  ci = false,
): string {
  const heading = ci
    ? `${definition.id} · ${definition.title}`
    : chalk.bold(`${definition.id} · ${definition.title}`);
  return [
    "",
    heading,
    "",
    definition.summary,
    "",
    `Impact: ${definition.impact}`,
    `Remediation: ${definition.remediation}`,
    `Verify: ${definition.verify}`,
    ...(definition.prerequisites?.length
      ? [`Prerequisites: ${definition.prerequisites.join(", ")}`]
      : []),
    "",
  ].join("\n");
}

export function formatDoctorFixPlan(
  fixes: readonly DoctorFixResult[],
  ci = false,
): string {
  const bold = (value: string) => ci ? value : chalk.bold(value);
  return [
    "",
    bold("Authenik8 doctor fix plan"),
    ...(fixes.length > 0
      ? fixes.map(
        (fix) => `- ${fix.id} (${fix.classification}): ${fix.description}`,
      )
      : ["- No applicable fixes"]
    ),
    "",
  ].join("\n");
}

export function doctorHelp(): string {
  return `
AUTHENIK8 DOCTOR
Validate a generated project's authentication boundary

Usage:
  create-authenik8-app doctor [directory] [options]

Options:
  --deep             Run isolated Redis and installed core runtime checks
  --production       Run deep checks plus production deployment policy
  --check <ID>       Run one stable diagnostic and its prerequisites
  --explain <ID>     Explain one diagnostic without running a project
  --fix              Apply eligible safe fixes and verify them
  --dry-run          Preview fixes without writing; requires --fix
  --json             Print a schema-versioned machine-readable report
  --ci               Print deterministic output without colour
  --strict           Fail when warnings are present
  --report           Write a sanitized support report
  --offline          Validate .env.example without live services or disk secrets
  --skip-services    Legacy service-skip mode; prefer --offline in CI
  -h, --help         Show this help message

Examples:
  npx create-authenik8-app doctor
  npx create-authenik8-app doctor --deep
  npx create-authenik8-app doctor --production
  npx create-authenik8-app doctor --check A8-DB-003
  npx create-authenik8-app doctor --explain A8-JWK-006
  npx create-authenik8-app doctor --fix --dry-run
  npx create-authenik8-app doctor --ci --offline --strict
`;
}
