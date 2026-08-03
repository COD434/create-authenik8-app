import type { OAuthProvider } from "../../lib/oauth.js";
import type { DoctorPreset, DoctorReport } from "../doctor/types.js";

export type OpsOperation =
  | "readiness"
  | "audit-production"
  | "verify-oauth"
  | "rotate-signing-key"
  | "revoke-user-sessions";

type OpsBaseOptions = {
  directory: string;
  json: boolean;
};

export type OpsOptions =
  | (OpsBaseOptions & { operation: "readiness" })
  | (OpsBaseOptions & { operation: "audit-production" })
  | (OpsBaseOptions & {
      operation: "verify-oauth";
      provider?: OAuthProvider;
    })
  | (OpsBaseOptions & {
      operation: "rotate-signing-key";
      apply: boolean;
      confirmActiveKid?: string;
      activateKid?: string;
    })
  | (OpsBaseOptions & {
      operation: "revoke-user-sessions";
      userId: string;
      apply: boolean;
      confirmUser?: string;
      reason?: string;
    });

export type ParsedOpsArguments =
  | { help: true; json: boolean }
  | ({ help: false } & OpsOptions);

type OpsResultBase = {
  schemaVersion: 1;
  operation: OpsOperation;
  status: "passed" | "failed" | "planned" | "applied" | "partial";
  rootDir: string;
  preset: DoctorPreset;
  generatedAt: string;
};

export type OpsDiagnosticResult = OpsResultBase & {
  operation: "readiness" | "audit-production";
  status: "passed" | "failed";
  diagnostics: DoctorReport;
  reportPath?: string;
};

export type OAuthVerification = {
  provider: OAuthProvider;
  status: "passed" | "failed";
  authorizationHost?: string;
  stateStored: boolean;
  message: string;
};

export type OpsOAuthResult = OpsResultBase & {
  operation: "verify-oauth";
  status: "passed" | "failed";
  assurance: "redirect-initialization";
  limitation: string;
  providers: OAuthVerification[];
};

export type SigningRotationPlan = {
  environmentFile: ".env";
  phase: "stage" | "activate";
  previousActiveKid: string;
  targetKid: string;
  activeKidAfter: string;
  retainedKeyCount: number;
  resultingKeyCount: number;
  deploymentInstruction: string;
};

export type OpsSigningRotationResult = OpsResultBase & {
  operation: "rotate-signing-key";
  status: "planned" | "applied";
  plan: SigningRotationPlan;
  verified: boolean;
};

export type SessionRevocationPlan = {
  userId: string;
  activeCoreSessions: number;
  activeDatabaseSessions?: number;
  reasonRecorded: boolean;
};

export type SessionInspection = {
  activeCoreSessions: number;
  activeDatabaseSessions?: number;
};

export type OpsSessionRevocationResult = OpsResultBase & {
  operation: "revoke-user-sessions";
  status: "planned" | "applied" | "partial";
  plan: SessionRevocationPlan;
  coreRevoked: boolean;
  databaseRevoked?: boolean;
  auditRecorded?: boolean;
  receiptPath?: string;
  message?: string;
};

export type OpsResult =
  | OpsDiagnosticResult
  | OpsOAuthResult
  | OpsSigningRotationResult
  | OpsSessionRevocationResult;
