import { runDoctor } from "./index.js";
import type { DoctorCheck } from "./types.js";

export type PostGenerationDoctorResult = {
  passed: number;
  warnings: number;
  warningLabels: readonly string[];
};

function withoutServiceProbe(checks: readonly DoctorCheck[]): DoctorCheck[] {
  return checks.filter((check) => check.id !== "service.redis");
}

export async function runPostGenerationDoctor(
  rootDir: string,
  dependenciesInstalled: boolean,
): Promise<PostGenerationDoctorResult> {
  const report = await runDoctor(
    { directory: rootDir, json: false, skipServices: true },
    { allowMissingCore: !dependenciesInstalled },
  );
  const checks = withoutServiceProbe(report.checks);
  const failures = checks.filter((check) => check.status === "fail");
  if (failures.length > 0) {
    const details = failures
      .map((check) => `${check.label}: ${check.message}`)
      .join("; ");
    throw new Error(`Generated auth validation failed: ${details}`);
  }

  const warnings = checks.filter((check) => check.status === "warn");
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    warnings: warnings.length,
    warningLabels: warnings.map((check) => check.label),
  };
}
