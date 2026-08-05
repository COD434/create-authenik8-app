import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

import type { DoctorContext } from "../doctor/types.js";
import { replacePrivateFile } from "./privateFile.js";
import type { SessionInspection } from "./types.js";

export class OpsReceiptError extends Error {}

type RevocationReceiptStatus = "authorized" | "applied" | "failed";

type RevocationReceipt = {
  schemaVersion: 1;
  operation: "revoke-user-sessions";
  status: RevocationReceiptStatus;
  generatedAt: string;
  completedAt?: string;
  rootDir: string;
  preset: DoctorContext["preset"];
  userId: string;
  reason: string;
  activeCoreSessions: number;
  failure?: string;
};

export type PendingRevocationReceipt = {
  path: string;
  complete(
    status: Exclude<RevocationReceiptStatus, "authorized">,
    failure?: string,
  ): Promise<void>;
};

async function privateDirectory(directory: string): Promise<void> {
  await fs.ensureDir(directory);
  const metadata = await fs.lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new OpsReceiptError(
      `Operation receipt directory must be a regular directory: ${directory}`,
    );
  }
  if (process.platform !== "win32") await fs.chmod(directory, 0o700);
}

async function atomicPrivateJson(
  filename: string,
  value: RevocationReceipt,
): Promise<void> {
  await replacePrivateFile(
    filename,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function receiptFilename(now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `revoke-user-sessions-${timestamp}-${randomUUID()}.json`;
}

export async function beginRevocationReceipt(
  context: DoctorContext,
  userId: string,
  reason: string,
  inspection: SessionInspection,
  now = new Date(),
): Promise<PendingRevocationReceipt> {
  const privateRoot = path.join(context.rootDir, ".authenik8");
  const operationsDirectory = path.join(privateRoot, "operations");
  await privateDirectory(privateRoot);
  await privateDirectory(operationsDirectory);
  const filename = path.join(operationsDirectory, receiptFilename(now));
  const receipt: RevocationReceipt = {
    schemaVersion: 1,
    operation: "revoke-user-sessions",
    status: "authorized",
    generatedAt: now.toISOString(),
    rootDir: context.rootDir,
    preset: context.preset,
    userId,
    reason,
    activeCoreSessions: inspection.activeCoreSessions,
  };
  await atomicPrivateJson(filename, receipt);

  return {
    path: filename,
    async complete(status, failure) {
      await atomicPrivateJson(filename, {
        ...receipt,
        status,
        completedAt: new Date().toISOString(),
        ...(failure ? { failure: failure.slice(0, 400) } : {}),
      });
    },
  };
}
