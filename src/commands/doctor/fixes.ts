import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";

import type {
  DoctorCheck,
  DoctorContext,
  DoctorFixResult,
} from "./types.js";

export class DoctorFixError extends Error {}

type ReversibleFix = {
  result: DoctorFixResult;
  apply(): Promise<() => Promise<void>>;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function atomicWrite(filename: string, value: string, mode?: number) {
  const temporaryPath = `${filename}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await fs.ensureDir(path.dirname(filename));
    await fs.writeFile(temporaryPath, value, mode === undefined ? {} : { mode });
    await fs.move(temporaryPath, filename, { overwrite: true });
    if (mode !== undefined && process.platform !== "win32") {
      await fs.chmod(filename, mode);
    }
  } finally {
    await fs.remove(temporaryPath);
  }
}

function envIgnored(source: string): boolean {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === ".env" || line === ".env*" || line === ".env.*");
}

function envTracked(rootDir: string): boolean {
  const result = spawnSync(
    "git",
    ["-C", rootDir, "ls-files", "--error-unmatch", ".env"],
    { stdio: "ignore" },
  );
  return result.status === 0;
}

async function gitignoreFix(context: DoctorContext): Promise<ReversibleFix | undefined> {
  const filename = path.join(context.rootDir, ".gitignore");
  const exists = await fs.pathExists(filename);
  const before = exists ? await fs.readFile(filename) : null;
  const source = before?.toString("utf8") ?? "";
  if (envIgnored(source) || envTracked(context.rootDir)) return undefined;

  const next = `${source.replace(/\s*$/, "")}${source.trim() ? "\n" : ""}.env\n`;
  const originalMode = exists ? (await fs.stat(filename)).mode & 0o777 : undefined;
  const result: DoctorFixResult = {
    id: "fix.ignore-env",
    diagnosticId: "A8-ENV-001",
    classification: "safe",
    status: "planned",
    description: "Add .env to .gitignore without changing any environment values",
    files: [".gitignore"],
    ...(before ? { beforeSha256: sha256(before) } : {}),
    afterSha256: sha256(next),
  };

  return {
    result,
    async apply() {
      await atomicWrite(filename, next, originalMode);
      return async () => {
        if (before === null) {
          await fs.remove(filename);
        } else {
          await atomicWrite(filename, before.toString("utf8"), originalMode);
        }
      };
    },
  };
}

async function envModeFix(context: DoctorContext): Promise<ReversibleFix | undefined> {
  if (process.platform === "win32" || context.envSource !== ".env") return undefined;
  const filename = path.join(context.rootDir, ".env");
  if (!(await fs.pathExists(filename))) return undefined;
  const beforeMode = (await fs.stat(filename)).mode & 0o777;
  if ((beforeMode & 0o077) === 0) return undefined;
  const source = await fs.readFile(filename);
  const result: DoctorFixResult = {
    id: "fix.env-mode",
    diagnosticId: "A8-ENV-003",
    classification: "safe",
    status: "planned",
    description: "Restrict .env permissions to the owning user",
    files: [".env"],
    beforeSha256: sha256(source),
    afterSha256: sha256(source),
  };

  return {
    result,
    async apply() {
      await fs.chmod(filename, 0o600);
      return async () => {
        await fs.chmod(filename, beforeMode);
      };
    },
  };
}

function manualFixes(
  checks: readonly DoctorCheck[],
  automatedDiagnosticIds: ReadonlySet<string>,
): DoctorFixResult[] {
  return checks
    .filter(
      (item) => item.status === "fail"
        && item.fix
        && !automatedDiagnosticIds.has(item.id),
    )
    .map((item) => ({
      id: `manual.${item.id.toLowerCase()}`,
      diagnosticId: item.id,
      classification: "manual" as const,
      status: "skipped" as const,
      description: item.fix!,
      files: [],
    }));
}

export async function runDoctorFixes(
  context: DoctorContext,
  checks: readonly DoctorCheck[],
  dryRun: boolean,
  verify: () => Promise<readonly DoctorCheck[]>,
  onPlan?: (fixes: readonly DoctorFixResult[]) => void | Promise<void>,
): Promise<DoctorFixResult[]> {
  const candidates = (
    await Promise.all([
      gitignoreFix(context),
      envModeFix(context),
    ])
  ).filter((candidate): candidate is ReversibleFix => Boolean(candidate));
  const automatedIds = new Set(
    candidates.map((candidate) => candidate.result.diagnosticId),
  );
  const manual = manualFixes(checks, automatedIds);
  const plan = [...candidates.map((candidate) => candidate.result), ...manual];
  if (!dryRun) await onPlan?.(plan);
  if (dryRun || candidates.length === 0) {
    return plan;
  }

  const rollbacks: Array<() => Promise<void>> = [];
  try {
    for (const candidate of candidates) {
      rollbacks.push(await candidate.apply());
      candidate.result.status = "applied";
    }
    const verified = await verify();
    for (const candidate of candidates) {
      const check = verified.find(
        (item) => item.id === candidate.result.diagnosticId,
      );
      if (!check || (check.status !== "pass" && check.status !== "skip")) {
        throw new DoctorFixError(
          `${candidate.result.id} did not pass post-apply verification`,
        );
      }
    }
    return [...candidates.map((candidate) => candidate.result), ...manual];
  } catch (error) {
    for (const rollback of rollbacks.reverse()) {
      try {
        await rollback();
      } catch {}
    }
    if (error instanceof DoctorFixError) {
      throw new DoctorFixError(
        `${error.message}; captured files were restored`,
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new DoctorFixError(`Doctor fix failed and captured files were restored: ${detail}`);
  }
}
