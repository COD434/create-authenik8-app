import chalk from "chalk";
import type { CliState } from "../lib/types.js";

function selectedOAuthProviders(state: CliState): string[] {
  const providers = state.oauthProviders?.filter((provider) =>
    provider === "google" || provider === "github"
  );

  return providers?.length ? providers : ["google", "github"];
}

function oauthProviderLabel(state: CliState): string {
  return selectedOAuthProviders(state)
    .map((provider) => provider === "github" ? "GitHub" : "Google")
    .join("/");
}

function oauthRouteLines(state: CliState): string {
  return selectedOAuthProviders(state)
    .map((provider) => `  GET    /auth/${provider}`)
    .join("\n");
}

export function printSummary(state: CliState, isProduction: boolean): void {
  console.log(chalk.green.bold("\n🎉 Authenik8 app created successfully!\n"));

  console.log(chalk.white(`
Next steps:

cd ${state.projectName}
${state.usePrisma ? "npm run prisma:migrate\n" : ""}redis-server --daemonize yes
npm run dev

Before running, review .env and replace generated development values for deployed environments.
${state.authMode === "auth-oauth" ? `For OAuth, set real ${oauthProviderLabel(state)} client IDs, secrets, and redirect URLs in .env.\n` : ""}

Auth Features:
${
  state.authMode === "base"
    ? "✓ JWT only"
    : state.authMode === "auth"
    ? "✓ Email + Password"
    : `✓ Password + OAuth (${oauthProviderLabel(state)})`
}

🛠 Stack:
✔ Express
✔ ${state.usePrisma ? (state.database === "postgresql" ? "PostgreSQL" : "SQLite") : "No database"}
✔ ${state.usePrisma ? "Prisma ORM" : "No ORM"}

📡 API Routes:
${
  state.authMode === "base"
    ? `
  GET    /public
  GET    /guest
  GET    /protected
  POST   /refresh
`
    : state.authMode === "auth"
    ? `
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh
  GET    /protected
`
    : `
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh
${oauthRouteLines(state)}
  GET    /protected
`
}
✅ Done! Enjoying authenik8?
⭐ Star us → github.com/COD434/create-authenik8-app
💬 Drop feedback → github.com/COD434/create-authenik8-app/discussions

🔥 You're ready to build.
`));

  if (isProduction) {
    console.log(`
🚀 Production Ready Enabled:

✔ PM2 installed
✔ Cluster mode enabled
✔ Memory auto-restart (300MB)

Run:
npm run pm2:start
`);
  }
}
