import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

import {
  PROJECT_MANIFEST_FILENAME,
  projectManifestSchema,
} from "../../lib/projectManifest.js";
import {
  compareSemanticVersions,
  parseSemanticVersion,
} from "../../lib/semver.js";
import { runDoctor } from "../doctor/index.js";
import { createUpgradeContext, UpgradeProjectError } from "./context.js";
import type { UpgradeAcknowledgement } from "./types.js";

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function exactVersion(value: string): boolean {
  return EXACT_VERSION.test(value) && parseSemanticVersion(value) !== undefined;
}

export async function acknowledgeUpgrade(
  directory: string,
): Promise<UpgradeAcknowledgement> {
  const context = await createUpgradeContext(directory);
  if (!exactVersion(context.declaredEngineVersion)) {
    throw new UpgradeProjectError(
      "Upgrade acknowledgement requires an exact authenik8-core version; ranges and tags are not accepted.",
    );
  }
  if (!context.installedEngineVersion) {
    throw new UpgradeProjectError(
      "Install the declared authenik8-core release before acknowledgement.",
    );
  }
  if (context.installedEngineVersion !== context.declaredEngineVersion) {
    throw new UpgradeProjectError(
      `Installed authenik8-core ${context.installedEngineVersion} does not match the ${context.declaredEngineVersion} declaration.`,
    );
  }
  if (context.declaredEngineVersion !== context.targetEngineVersion) {
    throw new UpgradeProjectError(
      `The running CLI requires authenik8-core ${context.targetEngineVersion}; package.json declares ${context.declaredEngineVersion}.`,
    );
  }

  const generatorOrder = compareSemanticVersions(
    context.manifest.generatedBy.version,
    context.targetGeneratorVersion,
  );
  if (generatorOrder === "invalid" || generatorOrder === "newer") {
    throw new UpgradeProjectError(
      "The running CLI cannot acknowledge an invalid generator version or a generator downgrade.",
    );
  }
  const engineOrder = compareSemanticVersions(
    context.manifest.engine.version,
    context.declaredEngineVersion,
  );
  if (engineOrder === "invalid" || engineOrder === "newer") {
    throw new UpgradeProjectError(
      "Upgrade acknowledgement refuses an invalid engine version or engine downgrade.",
    );
  }

  const verification = await runDoctor({
    directory: context.rootDir,
    json: true,
    skipServices: false,
    deep: true,
    checkId: "A8-CORE-002",
    ci: true,
  });
  if (verification.summary.failed > 0) {
    const failures = verification.checks
      .filter((check) => check.status === "fail")
      .map((check) => `${check.id}: ${check.message}`)
      .join("; ");
    throw new UpgradeProjectError(
      `Upgrade acknowledgement requires a passing deep Doctor verification: ${failures}`,
    );
  }

  const next = projectManifestSchema.parse({
    ...context.manifest,
    generatedBy: {
      ...context.manifest.generatedBy,
      version: context.targetGeneratorVersion,
    },
    engine: {
      ...context.manifest.engine,
      version: context.declaredEngineVersion,
    },
  });
  const status = generatorOrder === "equal" && engineOrder === "equal"
    ? "unchanged"
    : "acknowledged";
  if (status === "acknowledged") {
    const manifestPath = path.join(context.rootDir, PROJECT_MANIFEST_FILENAME);
    const temporaryPath = `${manifestPath}.${process.pid}-${randomUUID()}.tmp`;
    try {
      await fs.writeJson(temporaryPath, next, { spaces: 2 });
      await fs.move(temporaryPath, manifestPath, { overwrite: true });
    } finally {
      await fs.remove(temporaryPath);
    }
  }

  return {
    schemaVersion: 1,
    rootDir: context.rootDir,
    status,
    previous: {
      generator: context.manifest.generatedBy.version,
      engine: context.manifest.engine.version,
    },
    current: {
      generator: next.generatedBy.version,
      engine: next.engine.version,
    },
  };
}
