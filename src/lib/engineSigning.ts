import { randomBytes, randomUUID } from "node:crypto";

import type { ProjectEngine } from "./projectEngine.js";

export async function exerciseEngineSigningKeyRing(
  engine: ProjectEngine,
  keys: Array<Record<string, unknown>>,
  activeKid: string,
): Promise<Array<Record<string, unknown>>> {
  const issuer = "https://ops.authenik8.invalid";
  const audience = `ops-signing-${randomUUID()}`;
  const auth = await engine.createAuthenik8({
    jwt: {
      keys,
      activeKid,
      issuer,
      audience,
    },
    refreshSecret: randomBytes(48).toString("base64url"),
    redis: {
      on() {
        return this;
      },
    },
    redisKeyPrefix: `authenik8:ops:signing:${randomUUID()}`,
    security: {
      rateLimiterEnabled: false,
      whiteListEnabled: false,
      helmetEnabled: false,
    },
  });
  const token = await auth.signToken({
    sessionId: `ops-signing-${randomUUID()}`,
  });
  const publicKeys = auth.getJwks().keys;
  if (publicKeys.length !== keys.length) {
    throw new Error(
      "the installed engine returned an incomplete public key ring",
    );
  }
  await engine.verifyAccessTokenWithJwks(
    token,
    { keys: publicKeys },
    { issuer, audience },
  );
  return publicKeys as Array<Record<string, unknown>>;
}
