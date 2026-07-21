import { createAuthenik8 } from "authenik8-core";
import type { Authenik8Instance } from "authenik8-core";
import dotenv  from "dotenv";
<<<<<<< HEAD
<<<<<<< HEAD
import { createRedisClient } from "../config/redis";
=======
>>>>>>> 20fbce9 (fix: aligned wires with latest core)
=======
import { createRedisClient } from "../config/redis";
>>>>>>> 6ce4a8b (addons: alot of tests features and broken func fixes)
import { agentIdentityConfig, authJwkConfig, requiredSecret } from "../utils/security";

dotenv.config();

let authInstance: Authenik8Instance | undefined;

function oauthConfig() {
  return {};
}

export async function initAuth() {
  authInstance= await createAuthenik8({
    jwt: authJwkConfig(),
    refreshSecret: requiredSecret("REFRESH_SECRET"),
    agent: agentIdentityConfig(),
<<<<<<< HEAD
<<<<<<< HEAD
    redis: await createRedisClient(),
=======
>>>>>>> 20fbce9 (fix: aligned wires with latest core)
=======
    redis: await createRedisClient(),
>>>>>>> 6ce4a8b (addons: alot of tests features and broken func fixes)
    oauth: oauthConfig(),
  });

}
export function getAuth() {
  if (!authInstance) {
    throw new Error("Auth not initialized. Call initAuth() first.");
  }

  return authInstance;
}

export const auth = new Proxy(
  {},
  {
    get(_target, property) {
      return getAuth()[property as keyof ReturnType<typeof getAuth>];
    },
  },
) as Authenik8Instance;
