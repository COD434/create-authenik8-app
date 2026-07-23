import { createAuthenik8 } from "authenik8-core";
import dotenv  from "dotenv";
<<<<<<< HEAD
import { createRedisClient } from "../config/redis";
=======
>>>>>>> main
import { agentIdentityConfig, authJwkConfig, requiredSecret } from "../utils/security";

dotenv.config();

let authInstance: any;

function oauthConfig() {
  return {};
}

export async function initAuth() {
  authInstance= await createAuthenik8({
    jwt: authJwkConfig(),
    refreshSecret: requiredSecret("REFRESH_SECRET"),
    agent: agentIdentityConfig(),
<<<<<<< HEAD
    redis: await createRedisClient(),
=======
>>>>>>> main
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
) as any;
