import type { DoctorCheck } from "../doctor/types.js";
import type { OpsResult } from "./types.js";

function checkLine(check: DoctorCheck): string {
  return `  [${check.status.toUpperCase()}] ${check.id} ${check.label}: ${check.message}`;
}

export function formatOpsResult(result: OpsResult, json = false): string {
  if (json) return JSON.stringify(result, null, 2);

  const lines = [
    "Authenik8 operations",
    `Operation: ${result.operation}`,
    `Status: ${result.status}`,
    `Project: ${result.rootDir}`,
    `Preset: ${result.preset}`,
  ];

  if (
    result.operation === "readiness"
    || result.operation === "audit-production"
  ) {
    const { summary } = result.diagnostics;
    lines.push(
      `Diagnostics: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed, ${summary.skipped} skipped`,
      ...result.diagnostics.checks
        .filter((check) => check.status !== "pass")
        .map(checkLine),
    );
    if (result.reportPath) {
      lines.push(`Private report: ${result.reportPath}`);
    }
    return lines.join("\n");
  }

  if (result.operation === "verify-oauth") {
    lines.push(`Assurance: ${result.assurance}`);
    for (const provider of result.providers) {
      lines.push(
        `  [${provider.status.toUpperCase()}] ${provider.provider}: ${provider.message}`,
      );
      if (provider.authorizationHost) {
        lines.push(`    Authorization host: ${provider.authorizationHost}`);
      }
    }
    lines.push(`Limitation: ${result.limitation}`);
    return lines.join("\n");
  }

  if (result.operation === "rotate-signing-key") {
    lines.push(
      `Phase: ${result.plan.phase}`,
      `Current active kid: ${result.plan.previousActiveKid}`,
      `Target kid: ${result.plan.targetKid}`,
      `Active kid after apply: ${result.plan.activeKidAfter}`,
      `Retained keys: ${result.plan.retainedKeyCount}`,
      `Resulting key count: ${result.plan.resultingKeyCount}`,
      result.status === "planned"
        ? "No files changed. Re-run with --apply and --confirm-active-kid using the current kid shown above."
        : "The private .env was updated atomically and the resulting key ring passed verification.",
      `Next: ${result.plan.deploymentInstruction}`,
    );
    return lines.join("\n");
  }

  if (result.operation !== "revoke-user-sessions") {
    throw new Error(`Unsupported ops result: ${result.operation}`);
  }
  lines.push(
    `Target user: ${result.plan.userId}`,
    `Active core sessions: ${result.plan.activeCoreSessions}`,
  );
  if (result.plan.activeDatabaseSessions !== undefined) {
    lines.push(
      `Active database sessions: ${result.plan.activeDatabaseSessions}`,
    );
  }
  if (result.status === "planned") {
    lines.push(
      "No sessions changed. Re-run with --apply, --confirm-user using the target ID, and --reason.",
    );
  } else {
    lines.push(
      `Core revoked: ${result.coreRevoked ? "yes" : "no"}`,
    );
    if (result.databaseRevoked !== undefined) {
      lines.push(
        `Database revoked: ${result.databaseRevoked ? "yes" : "no"}`,
      );
    }
    if (result.auditRecorded !== undefined) {
      lines.push(`Audit recorded: ${result.auditRecorded ? "yes" : "no"}`);
    }
    if (result.receiptPath) {
      lines.push(`Private receipt: ${result.receiptPath}`);
    }
    if (result.message) lines.push(`Attention: ${result.message}`);
  }
  return lines.join("\n");
}

export function formatOpsError(
  code: string,
  message: string,
  json = false,
): string {
  return json
    ? JSON.stringify({
        schemaVersion: 1,
        status: "error",
        error: { code, message },
      }, null, 2)
    : `Error: ${message}`;
}

export function opsHelp(): string {
  return `
Authenik8 operational maintenance

Usage:
  create-authenik8-app ops readiness [directory] [--json]
  create-authenik8-app ops audit production [directory] [--json]
  create-authenik8-app ops verify oauth [google|github] [directory] [--json]
  create-authenik8-app ops rotate signing-key [directory] [--json]
  create-authenik8-app ops rotate signing-key [directory] --apply --confirm-active-kid <kid> [--json]
  create-authenik8-app ops rotate signing-key [directory] --activate-kid <staged-kid> [--json]
  create-authenik8-app ops rotate signing-key [directory] --activate-kid <staged-kid> --apply --confirm-active-kid <kid> [--json]
  create-authenik8-app ops revoke user <user-id> [directory] --all-sessions [--json]
  create-authenik8-app ops revoke user <user-id> [directory] --all-sessions --apply --confirm-user <user-id> --reason <text> [--json]

Safety:
  Rotation and revocation print a plan by default.
  Rotation is two-phase: stage and deploy the ring everywhere, then activate.
  Applying either phase requires the current active key ID.
  Applying revocation requires the exact user ID and an operator reason.
  Express revocation writes a private operation receipt before changing sessions.
  JSON output never includes signing keys, refresh secrets, OAuth secrets, or Redis credentials.

Assurance:
  readiness          Runs strict production and live runtime diagnostics.
  audit production   Runs the same diagnostics and writes a private sanitized report.
  verify oauth       Proves local redirect initialization and one-use isolated state.
                     It does not contact a provider or validate credentials with it.
`.trim();
}
