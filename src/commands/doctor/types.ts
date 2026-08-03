import type { OAuthProvider } from "../../lib/oauth.js";
import type { ProjectManifestReadResult } from "../../lib/projectManifest.js";
import type { AuthMode, Database } from "../../lib/types.js";

export type DoctorPreset = AuthMode;
export type DoctorStatus = "pass" | "warn" | "fail" | "skip";
export type DoctorPackageManager = "npm" | "pnpm" | "bun";
export type EnvironmentValues = Record<string, string | undefined>;
export type DoctorMode = "default" | "deep" | "production" | "offline";

export type PackageJson = {
  name?: string;
  version?: string;
  main?: string;
  exports?: unknown;
  workspaces?: string[];
  trustedDependencies?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type DoctorContext = {
  rootDir: string;
  appDir: string;
  preset: DoctorPreset;
  packageManager: DoctorPackageManager;
  packageJson: PackageJson;
  appPackageJson: PackageJson;
  env: EnvironmentValues;
  envSource: ".env" | ".env.example" | "none";
  envParseError?: string;
  oauthProviders: OAuthProvider[];
  usesPrisma: boolean;
  databaseProvider?: Database;
  manifest: ProjectManifestReadResult;
};

export type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  message: string;
  fix?: string;
  impact?: string;
  remediation?: string;
  verification?: string;
};

export type DoctorSummary = {
  passed: number;
  warnings: number;
  failed: number;
  skipped: number;
};

export type DoctorFixClassification = "safe" | "confirmation-required" | "manual";
export type DoctorFixStatus = "planned" | "applied" | "skipped";

export type DoctorFixResult = {
  id: string;
  diagnosticId: string;
  classification: DoctorFixClassification;
  status: DoctorFixStatus;
  description: string;
  files: string[];
  beforeSha256?: string;
  afterSha256?: string;
};

export type DoctorReport = {
  schemaVersion: 1;
  rootDir: string;
  preset: DoctorPreset;
  mode: DoctorMode;
  checks: DoctorCheck[];
  summary: DoctorSummary;
  fixes?: DoctorFixResult[];
};

export type RedisEndpoint = {
  host: string;
  port: number;
  tls: boolean;
  username?: string;
  password?: string;
};

export type RedisProbe = (endpoint: RedisEndpoint) => Promise<void>;

export type DoctorOptions = {
  directory: string;
  json: boolean;
  skipServices: boolean;
  deep?: boolean;
  production?: boolean;
  fix?: boolean;
  dryRun?: boolean;
  checkId?: string;
  explainId?: string;
  ci?: boolean;
  strict?: boolean;
  report?: boolean;
  offline?: boolean;
};

export type DoctorRuntimeOptions = {
  nodeVersion?: string;
  redisProbe?: RedisProbe;
  allowMissingCore?: boolean;
  now?: () => Date;
  onFixPlan?: (
    fixes: readonly DoctorFixResult[],
  ) => void | Promise<void>;
};
