import { runDoctor } from "../doctor/index.js";
import type {
  DoctorCheck,
  DoctorReport,
} from "../doctor/types.js";
import { runUpgrade } from "../upgrade/index.js";
import type { UpgradePlan } from "../upgrade/types.js";
import {
  readProjectManifest,
  type ProjectManifest,
  type ProjectManifestReadResult,
} from "../../lib/projectManifest.js";
import type {
  StudioCapability,
  StudioFinding,
  StudioSnapshot,
} from "./types.js";

export class StudioProjectError extends Error {}

export type StudioSnapshotSources = {
  readManifest(directory: string): Promise<ProjectManifestReadResult>;
  runDoctor(directory: string): Promise<DoctorReport>;
  runUpgrade(directory: string): Promise<UpgradePlan>;
  now(): Date;
};

const defaultSources: StudioSnapshotSources = {
  readManifest: readProjectManifest,
  runDoctor: (directory) =>
    runDoctor({
      directory,
      json: false,
      skipServices: false,
      deep: false,
      production: false,
      fix: false,
      dryRun: false,
      ci: false,
      strict: false,
      report: false,
      offline: true,
    }),
  runUpgrade: (directory) =>
    runUpgrade({
      directory,
      json: false,
      check: false,
      acknowledge: false,
      help: false,
    }),
  now: () => new Date(),
};

const driftDiagnosticIds = new Set([
  "A8-PROJECT-001",
  "A8-PROJECT-002",
  "A8-PROJECT-003",
  "A8-CORE-001",
]);

function capabilities(manifest: ProjectManifest): StudioCapability[] {
  const result: StudioCapability[] = [
    {
      id: "preset",
      label: manifest.preset,
      detail: "Generated application preset",
    },
    {
      id: "sessions",
      label: "Stateful sessions",
      detail: "JWT access tokens with refresh rotation",
    },
  ];

  if (manifest.features.prisma) {
    result.push({
      id: "prisma",
      label: "Prisma",
      detail: `${manifest.database ?? "Configured"} identity persistence`,
    });
  }
  for (const provider of manifest.features.oauthProviders) {
    result.push({
      id: `oauth-${provider}`,
      label: `${provider[0]!.toUpperCase()}${provider.slice(1)} OAuth`,
      detail: "Generated OAuth provider boundary",
    });
  }
  if (manifest.features.pm2) {
    result.push({
      id: "pm2",
      label: "PM2",
      detail: "Generated production process configuration",
    });
  }

  return result;
}

function posture(report: DoctorReport): StudioSnapshot["posture"] {
  if (report.summary.failed > 0) {
    return {
      status: "action-required",
      label: "Action required",
      detail: `${report.summary.failed} failed diagnostic${report.summary.failed === 1 ? "" : "s"} need attention.`,
    };
  }
  if (report.summary.warnings > 0) {
    return {
      status: "review",
      label: "Review recommended",
      detail: `${report.summary.warnings} warning${report.summary.warnings === 1 ? "" : "s"} remain in the local snapshot.`,
    };
  }
  return {
    status: "clear",
    label: "No issues detected",
    detail: "The scoped offline checks passed. This is not a security certification.",
  };
}

function drift(checks: readonly DoctorCheck[]): StudioSnapshot["drift"] {
  const relevant = checks.filter((check) => driftDiagnosticIds.has(check.id));
  const failed = relevant.filter((check) => check.status === "fail");
  const warnings = relevant.filter((check) => check.status === "warn");

  if (failed.length > 0) {
    return {
      status: "detected",
      label: "Drift detected",
      detail: `${failed.length} project-contract check${failed.length === 1 ? "" : "s"} failed.`,
      checks: failed.map((check) => check.id),
    };
  }
  if (warnings.length > 0) {
    return {
      status: "review",
      label: "Drift review needed",
      detail: `${warnings.length} project-contract warning${warnings.length === 1 ? "" : "s"} need review.`,
      checks: warnings.map((check) => check.id),
    };
  }
  return {
    status: "clear",
    label: "Contract aligned",
    detail: "Generated structure, manifest, scripts, and engine declaration agree.",
    checks: [],
  };
}

function actionableFindings(checks: readonly DoctorCheck[]): StudioFinding[] {
  const failed: StudioFinding[] = [];
  const warnings: StudioFinding[] = [];

  for (const check of checks) {
    if (check.status !== "fail" && check.status !== "warn") continue;
    const finding: StudioFinding = {
      id: check.id,
      label: check.label,
      status: check.status,
      message: check.message,
      ...(check.impact ? { impact: check.impact } : {}),
      ...(check.remediation ? { remediation: check.remediation } : {}),
      ...(check.verification ? { verification: check.verification } : {}),
    };
    (check.status === "fail" ? failed : warnings).push(finding);
  }

  return [...failed, ...warnings];
}

function nextAction(
  findings: readonly StudioFinding[],
  upgrade: UpgradePlan,
): StudioSnapshot["nextAction"] {
  const failed = findings.find((finding) => finding.status === "fail");
  if (failed) {
    return {
      label: `Resolve ${failed.id}`,
      detail: failed.remediation ?? failed.message,
      ...(failed.verification ? { command: failed.verification } : {}),
    };
  }

  const blockedUpgrade = upgrade.actions.find((action) => action.kind === "blocked");
  if (blockedUpgrade) {
    return {
      label: blockedUpgrade.title,
      detail: blockedUpgrade.detail,
      ...(blockedUpgrade.command ? { command: blockedUpgrade.command } : {}),
    };
  }

  const requiredUpgrade = upgrade.actions.find((action) => action.kind === "required");
  if (requiredUpgrade) {
    return {
      label: requiredUpgrade.title,
      detail: requiredUpgrade.detail,
      ...(requiredUpgrade.command ? { command: requiredUpgrade.command } : {}),
    };
  }

  const warning = findings.find((finding) => finding.status === "warn");
  if (warning) {
    return {
      label: `Review ${warning.id}`,
      detail: warning.remediation ?? warning.message,
      ...(warning.verification ? { command: warning.verification } : {}),
    };
  }

  return {
    label: "Assess production readiness",
    detail: "Run live-service and deployment policy checks before promoting this project.",
    command: "npx create-authenik8-app@latest doctor --production",
  };
}

export async function createStudioSnapshot(
  directory: string,
  sources: StudioSnapshotSources = defaultSources,
): Promise<StudioSnapshot> {
  const manifestResult = await sources.readManifest(directory);
  if (manifestResult.status === "missing") {
    throw new StudioProjectError(
      "authenik8.json is required. Run Studio from a generated Authenik8 project.",
    );
  }
  if (manifestResult.status === "invalid") {
    throw new StudioProjectError(manifestResult.message);
  }

  const [doctor, upgrade] = await Promise.all([
    sources.runDoctor(directory),
    sources.runUpgrade(directory),
  ]);
  const manifest = manifestResult.manifest;
  const findings = actionableFindings(doctor.checks);

  return {
    schemaVersion: 1,
    generatedAt: sources.now().toISOString(),
    project: {
      name: manifest.projectName,
      rootDir: doctor.rootDir,
      preset: manifest.preset,
      packageManager: manifest.packageManager,
      runtime: manifest.runtime,
      database: manifest.database,
      versions: {
        generator: manifest.generatedBy.version,
        engine: manifest.engine.version,
      },
    },
    scan: {
      mode: doctor.mode,
      boundary: "Offline Doctor snapshot. No .env secrets or live services were read.",
      summary: doctor.summary,
    },
    posture: posture(doctor),
    capabilities: capabilities(manifest),
    drift: drift(doctor.checks),
    productionReadiness: {
      status: "not-assessed",
      label: "Not assessed",
      detail: "Studio stays offline; production readiness requires an explicit live-service scan.",
      command: "npx create-authenik8-app@latest doctor --production",
    },
    upgrade: {
      status: upgrade.status,
      generator: {
        current: upgrade.versions.generator.project,
        target: upgrade.versions.generator.target,
      },
      engine: {
        current: upgrade.versions.engine.manifest,
        target: upgrade.versions.engine.target,
      },
      actions: upgrade.actions,
    },
    nextAction: nextAction(findings, upgrade),
    findings,
  };
}
