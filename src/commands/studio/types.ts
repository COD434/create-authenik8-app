import type {
  DoctorCheck,
  DoctorMode,
  DoctorSummary,
} from "../doctor/types.js";
import type {
  UpgradeAction,
  UpgradeStatus,
} from "../upgrade/types.js";
import type { AuthMode } from "../../lib/types.js";

export type StudioOptions = {
  directory: string;
  port: number;
  openBrowser: boolean;
  help: boolean;
};

export type StudioCapability = {
  id: string;
  label: string;
  detail: string;
};

export type StudioFinding = Pick<
  DoctorCheck,
  | "id"
  | "label"
  | "status"
  | "message"
  | "impact"
  | "remediation"
  | "verification"
>;

export type StudioPostureStatus = "clear" | "review" | "action-required";
export type StudioDriftStatus = "clear" | "review" | "detected";

export type StudioSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  project: {
    name: string;
    rootDir: string;
    preset: AuthMode;
    packageManager: string;
    runtime: string;
    database: string | null;
    versions: {
      generator: string;
      engine: string;
    };
  };
  scan: {
    mode: DoctorMode;
    boundary: string;
    summary: DoctorSummary;
  };
  posture: {
    status: StudioPostureStatus;
    label: string;
    detail: string;
  };
  capabilities: StudioCapability[];
  drift: {
    status: StudioDriftStatus;
    label: string;
    detail: string;
    checks: string[];
  };
  productionReadiness: {
    status: "not-assessed";
    label: string;
    detail: string;
    command: string;
  };
  upgrade: {
    status: UpgradeStatus;
    generator: {
      current: string;
      target: string;
    };
    engine: {
      current: string;
      target: string;
    };
    actions: UpgradeAction[];
  };
  nextAction: {
    label: string;
    detail: string;
    command?: string;
  };
  findings: StudioFinding[];
};

export type StudioServerOptions = {
  port: number;
  host?: "127.0.0.1";
};

export type StudioServer = {
  url: string;
  close(): Promise<void>;
};
