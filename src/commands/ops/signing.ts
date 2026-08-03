import {
  createHash,
  randomBytes,
} from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

import { exerciseEngineSigningKeyRing } from "../../lib/engineSigning.js";
import {
  loadProjectEngine,
  type ProjectEngine,
} from "../../lib/projectEngine.js";
import {
  inspectSigningKeyRing,
  type SigningJwk,
} from "../../lib/signingKeyRing.js";
import type { DoctorContext } from "../doctor/types.js";
import { replacePrivateFile } from "./privateFile.js";
import type { SigningRotationPlan } from "./types.js";

export class OpsSigningError extends Error {}

export type PreparedSigningRotation = {
  plan: SigningRotationPlan;
  apply(): Promise<() => Promise<void>>;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newKeyId(now: Date, existing: ReadonlySet<string>): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `a8-${date}-${randomBytes(6).toString("base64url")}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new OpsSigningError("Could not generate a unique signing key ID.");
}

function signingEngine(
  context: DoctorContext,
  requiresGeneration: boolean,
): ProjectEngine {
  try {
    return loadProjectEngine(
      context.appDir,
      [
        "createAuthenik8",
        "verifyAccessTokenWithJwks",
        ...(requiresGeneration ? ["generateSigningJwk" as const] : []),
      ],
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OpsSigningError(
      `Could not load the generated application's authenik8-core: ${detail.slice(0, 400)}`,
    );
  }
}

async function enginePublicKeyRing(
  engine: ProjectEngine,
  keys: SigningJwk[],
  activeKid: string,
): Promise<SigningJwk[]> {
  try {
    return await exerciseEngineSigningKeyRing(
      engine,
      keys,
      activeKid,
    ) as SigningJwk[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OpsSigningError(
      `The installed authenik8-core rejected the signing key ring: ${detail.slice(0, 400)}`,
    );
  }
}

function replaceSingleLineEnvironmentValues(
  source: string,
  replacements: Readonly<Record<string, string>>,
): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const seen = new Map<string, number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const assignment = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/,
    );
    if (!assignment) continue;
    const key = assignment[1]!;
    if (!(key in replacements)) continue;
    if (seen.has(key)) {
      throw new OpsSigningError(
        `${key} appears more than once in .env; reconcile the duplicate before rotating.`,
      );
    }
    const rawValue = assignment[2]!.trimStart();
    if (
      (rawValue.startsWith("'") && !/^'(?:[^']*)'\s*(?:#.*)?$/.test(rawValue))
      || (rawValue.startsWith("\"") && !/^"(?:[^"\\]|\\.)*"\s*(?:#.*)?$/.test(rawValue))
    ) {
      throw new OpsSigningError(
        `${key} uses a multiline or unsupported quoted value; normalize it to one line before rotating.`,
      );
    }
    seen.set(key, index);
  }

  for (const [key, value] of Object.entries(replacements)) {
    const index = seen.get(key);
    if (index === undefined) {
      throw new OpsSigningError(
        `${key} is missing from .env; restore a valid signing configuration before rotating.`,
      );
    }
    lines[index] = key === "AUTHENIK8_SIGNING_JWKS"
      ? `${key}='${value}'`
      : `${key}=${value}`;
  }
  return lines.join(newline);
}

async function atomicSecretWrite(
  filename: string,
  value: string,
  expectedSha256: string,
): Promise<void> {
  await replacePrivateFile(filename, value, async () => {
    const current = await fs.readFile(filename);
    if (sha256(current) !== expectedSha256) {
      throw new OpsSigningError(
        ".env changed after the rotation plan was prepared; no changes were applied.",
      );
    }
  });
}

export async function prepareSigningRotation(
  context: DoctorContext,
  now = new Date(),
  activateKid?: string,
): Promise<PreparedSigningRotation> {
  if (context.envSource !== ".env" || context.envParseError) {
    throw new OpsSigningError(
      "Key rotation requires a valid private .env file.",
    );
  }
  const configuredActiveKid = context.env.AUTHENIK8_ACTIVE_KID?.trim();
  const inspection = inspectSigningKeyRing(
    context.env.AUTHENIK8_SIGNING_JWKS,
    configuredActiveKid,
  );
  if (!inspection.valid) {
    throw new OpsSigningError(
      `The signing key ring cannot be rotated: ${inspection.error}.`,
    );
  }
  const { keys, active } = inspection;
  const activeKid = active.kid;
  const engine = signingEngine(context, !activateKid);
  await enginePublicKeyRing(engine, keys, activeKid);

  const filename = path.join(context.rootDir, ".env");
  const metadata = await fs.lstat(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new OpsSigningError(".env must be a regular file, not a symbolic link.");
  }
  const before = await fs.readFile(filename);
  const beforeSource = before.toString("utf8");
  let phase: SigningRotationPlan["phase"];
  let targetKid: string;
  let activeKidAfter: string;
  let nextKeys: SigningJwk[];
  let deploymentInstruction: string;

  if (activateKid) {
    const target = keys.find((key) => key.kid === activateKid);
    if (!target?.d) {
      throw new OpsSigningError(
        `The activation target ${activateKid} must select an existing staged private key.`,
      );
    }
    if (activateKid === activeKid) {
      throw new OpsSigningError(`${activateKid} is already the active signing key.`);
    }
    phase = "activate";
    targetKid = activateKid;
    activeKidAfter = activateKid;
    const publicKeys = await enginePublicKeyRing(
      engine,
      keys,
      activateKid,
    );
    const publicKeysById = new Map(
      publicKeys.map((key) => [key.kid, key]),
    );
    nextKeys = keys.map((key) =>
      key.kid === activateKid
        ? {
            ...key,
            alg: "ES256",
            use: "sig",
            key_ops: ["sign"],
          }
        : publicKeysById.get(key.kid)!
    );
    deploymentInstruction =
      "Deploy the activated ring to every instance. Instances running the staged ring can verify both the old and new keys during the rollout.";
  } else {
    const alreadyStaged = keys.filter(
      (key) => key.kid !== activeKid && typeof key.d === "string" && key.d,
    );
    if (alreadyStaged.length > 0) {
      throw new OpsSigningError(
        `A private signing key is already staged (${alreadyStaged.map((key) => key.kid).join(", ")}). Activate it or reconcile the key ring before staging another key.`,
      );
    }
    phase = "stage";
    targetKid = newKeyId(now, new Set(keys.map((key) => key.kid)));
    activeKidAfter = activeKid;
    nextKeys = [
      ...keys,
      await engine.generateSigningJwk(targetKid) as SigningJwk,
    ];
    deploymentInstruction =
      `Deploy this staged ring to every instance while ${activeKid} remains active. After that deployment completes, run rotate signing-key --activate-kid ${targetKid}.`;
  }
  await enginePublicKeyRing(engine, nextKeys, activeKidAfter);
  const nextSource = replaceSingleLineEnvironmentValues(beforeSource, {
    AUTHENIK8_SIGNING_JWKS: JSON.stringify(nextKeys),
    AUTHENIK8_ACTIVE_KID: activeKidAfter,
  });
  const beforeHash = sha256(before);
  const nextHash = sha256(nextSource);

  return {
    plan: {
      environmentFile: ".env",
      phase,
      previousActiveKid: activeKid,
      targetKid,
      activeKidAfter,
      retainedKeyCount: keys.length,
      resultingKeyCount: nextKeys.length,
      deploymentInstruction,
    },
    async apply() {
      await atomicSecretWrite(filename, nextSource, beforeHash);
      return async () => {
        await atomicSecretWrite(filename, beforeSource, nextHash);
      };
    },
  };
}
