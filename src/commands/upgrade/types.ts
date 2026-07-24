import type { AuthMode, PackageManager } from "../../lib/types.js";
import type { ProjectManifest } from "../../lib/projectManifest.js";

export type UpgradeStatus = "current" | "upgrade-available" | "blocked";
export type UpgradeActionKind = "required" | "recommended" | "blocked";

export type UpgradeAction = {
  id: string;
  kind: UpgradeActionKind;
  title: string;
  detail: string;
  command?: string;
  references?: string[];
};

export type UpgradeContext = {
  rootDir: string;
  appDir: string;
  manifest: ProjectManifest;
  packageManager: PackageManager;
  declaredEngineVersion: string;
  installedEngineVersion?: string;
  targetGeneratorVersion: string;
  targetEngineVersion: string;
};

export type UpgradePlan = {
  schemaVersion: 1;
  rootDir: string;
  preset: AuthMode;
  status: UpgradeStatus;
  versions: {
    generator: { project: string; target: string };
    engine: {
      manifest: string;
      declared: string;
      installed?: string;
      target: string;
    };
  };
  actions: UpgradeAction[];
};

export type UpgradeOptions = {
  directory: string;
  json: boolean;
  check: boolean;
  help: boolean;
};
