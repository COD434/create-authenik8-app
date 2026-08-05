import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

import type { DoctorReport } from "./types.js";

export class DoctorReportError extends Error {}

const sensitiveKey = /(?:password|secret|token|cookie|authorization|private.?key|credential)/i;
const jwtLike = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const bearer = /\bBearer\s+\S+/gi;
const authorizationHeader = /\bAuthorization\s*:\s*[^\r\n]+/gi;
const cookieHeader = /\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi;
const authCookieAssignment = /\b([A-Za-z0-9_.-]*(?:auth|session|refresh|token)[A-Za-z0-9_.-]*)=[^;\s]+/gi;
const credentialUrl = /\b([a-z][a-z0-9+.-]*:\/\/)([^@\s/]+)@/gi;
const privatePem = /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/g;
const privateJwkKey = /^(?:d|p|q|dp|dq|qi|oth|k)$/;

function redactString(value: string): string {
  return value
    .replace(privatePem, "<redacted-private-key>")
    .replace(jwtLike, "<redacted-jwt>")
    .replace(bearer, "Bearer <redacted>")
    .replace(authorizationHeader, "Authorization: <redacted>")
    .replace(cookieHeader, "Cookie: <redacted>")
    .replace(authCookieAssignment, "$1=<redacted>")
    .replace(credentialUrl, "$1<redacted>@");
}

function sanitize(value: unknown, key?: string): unknown {
  if (key && (sensitiveKey.test(key) || privateJwkKey.test(key))) {
    return "<redacted>";
  }
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitize(nestedValue, nestedKey),
      ]),
  );
}

function reportFilename(now: Date): string {
  return `doctor-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}

export async function writeDoctorSupportReport(
  report: DoctorReport,
  now = new Date(),
): Promise<string> {
  const reportsDir = path.join(report.rootDir, ".authenik8", "reports");
  const reportPath = path.join(reportsDir, reportFilename(now));
  const temporaryPath = `${reportPath}.${process.pid}-${randomUUID()}.tmp`;
  const envelope = sanitize({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    report,
  });
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;

  if (
    /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/.test(serialized)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(serialized)
    || /"d"\s*:\s*"(?!<redacted>)[^"]+"/.test(serialized)
  ) {
    throw new DoctorReportError(
      "Doctor refused to write a report because safe redaction could not be guaranteed.",
    );
  }

  try {
    await fs.ensureDir(reportsDir);
    await fs.writeFile(temporaryPath, serialized, { mode: 0o600 });
    await fs.move(temporaryPath, reportPath, { overwrite: false });
    if (process.platform !== "win32") await fs.chmod(reportPath, 0o600);
    return reportPath;
  } catch (error) {
    if (error instanceof DoctorReportError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new DoctorReportError(`Could not write a sanitized Doctor report: ${detail}`);
  } finally {
    await fs.remove(temporaryPath);
  }
}
