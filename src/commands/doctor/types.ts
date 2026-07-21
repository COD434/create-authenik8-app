import type { OAuthProvider } from "../../lib/oauth.js";
import type { ProjectManifestReadResult } from "../../lib/projectManifest.js";
import type { AuthMode, Database } from "../../lib/types.js";

export type DoctorPreset = AuthMode;
export type DoctorStatus = "pass" | "warn" | "fail";
export type DoctorPackageManager = "npm" | "pnpm" | "bun";
export type EnvironmentValues = Record<string, string | undefined>;

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
};

export type DoctorSummary = {
  passed: number;
  warnings: number;
  failed: number;
};

export type DoctorReport = {
  rootDir: string;
  preset: DoctorPreset;
  checks: DoctorCheck[];
  summary: DoctorSummary;
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
};

export type DoctorRuntimeOptions = {
  nodeVersion?: string;
  redisProbe?: RedisProbe;
  allowMissingCore?: boolean;
};
