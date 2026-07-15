import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

const managedNames = [
  "JWT_SECRET",
  "AUTHENIK8_PRIVATE_JWK",
  "AUTHENIK8_SIGNING_JWKS",
  "AUTHENIK8_ACTIVE_KID",
  "AUTHENIK8_ISSUER",
  "AUTHENIK8_AUDIENCE",
  "REFRESH_SECRET",
];

function withoutManagedValues(source: string): string {
  const names = new Set(managedNames);
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !names.has(line.split("=", 1)[0] ?? ""))
    .join("\n")
    .replace(/\n*$/, "\n");
}

function signingJwk() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    ...privateKey.export({ format: "jwk" }),
    alg: "ES256",
    use: "sig",
    key_ops: ["sign"],
    kid: randomUUID(),
  };
}

export async function configureSigningKeys(
  targetDir: string,
  projectName: string,
): Promise<void> {
  const envPath = path.join(targetDir, ".env");
  const examplePath = path.join(targetDir, ".env.example");
  const issuer = "http://localhost:3000";
  const audience = `${projectName}-api`;
  const key = signingJwk();
  const refreshSecret = randomBytes(48).toString("base64url");
  const env = await fs.readFile(envPath, "utf8");
  const example = await fs.readFile(examplePath, "utf8");

  await fs.writeFile(
    envPath,
    `${withoutManagedValues(env)}AUTHENIK8_SIGNING_JWKS='${JSON.stringify([key])}'\nAUTHENIK8_ACTIVE_KID=${key.kid}\nAUTHENIK8_ISSUER=${issuer}\nAUTHENIK8_AUDIENCE=${audience}\nREFRESH_SECRET=${refreshSecret}\n`,
  );
  await fs.writeFile(
    examplePath,
    `${withoutManagedValues(example)}AUTHENIK8_SIGNING_JWKS=\nAUTHENIK8_ACTIVE_KID=\nAUTHENIK8_ISSUER=${issuer}\nAUTHENIK8_AUDIENCE=${audience}\nREFRESH_SECRET=replace-with-at-least-32-random-characters\n`,
  );
}
