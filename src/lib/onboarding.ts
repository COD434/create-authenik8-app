import { packageCommand } from "./packageManagerCommands.js";
import type { AuthMode, PackageManager } from "./types.js";

export type FirstSuccessGuide = {
  title: string;
  steps: readonly string[];
};

export function doctorCommand(packageManager: PackageManager): string {
  return packageCommand(
    packageManager,
    "create-authenik8-app@latest",
    "doctor",
  );
}

export function firstSuccessGuide(authMode: AuthMode): FirstSuccessGuide {
  if (authMode === "fullstack") {
    return {
      title: "Sign in to the generated application",
      steps: [
        "Open http://localhost:5173 after the development server starts.",
        "Use SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD from .env.",
        "Change the seeded password before sharing the environment.",
      ],
    };
  }

  if (authMode === "auth" || authMode === "auth-oauth") {
    return {
      title: "Complete an authenticated API request",
      steps: [
        "Open README.md and follow the 3-Minute Verification.",
        "Register, sign in, and call GET /protected with the access token.",
        "Rotate the refresh token once and replace the previous value.",
      ],
    };
  }

  return {
    title: "Verify the JWT boundary",
    steps: [
      "Open README.md and follow the 3-Minute Verification.",
      "Confirm GET /public succeeds and GET /protected rejects a missing token.",
      "Connect your trusted identity source before calling auth.issueTokens().",
    ],
  };
}
