import { createAuthenik8 } from "authenik8-core";
import dotenv from "dotenv";
import { requiredEnv, requiredSecret } from "../utils/security";

dotenv.config();

let authInstance: any;



export async function initAuth() {
  authInstance= await createAuthenik8({
    jwtSecret: requiredSecret("JWT_SECRET"),
    refreshSecret: requiredSecret("REFRESH_SECRET"),

    oauth: {
      google: {
        clientId: requiredEnv("GOOGLE_CLIENT_ID"),
        clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
        redirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
      },
      github: {
        clientId: requiredEnv("GITHUB_CLIENT_ID"),
        clientSecret: requiredEnv("GITHUB_CLIENT_SECRET"),
        redirectUri: requiredEnv("GITHUB_REDIRECT_URI"),
      },
    },
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
