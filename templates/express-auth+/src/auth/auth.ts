import { createAuthenik8 } from "authenik8-core";
import dotenv from "dotenv";

dotenv.config();

let authInstance: any;



export async function initAuth() {
  authInstance= await createAuthenik8({
    jwtSecret: process.env.JWT_SECRET!,
    refreshSecret: process.env.REFRESH_SECRET!,

    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: "http://localhost:3000/auth/google/callback",
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        redirectUri: "http://localhost:3000/auth/github/callback",
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

