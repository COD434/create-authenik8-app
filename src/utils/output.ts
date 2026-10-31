import chalk from "chalk";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { doctorCommand, firstSuccessGuide } from "../lib/onboarding.js";
import { installCommand, runScriptCommand } from "../lib/packageManagerCommands.js";
import type { CliState } from "../lib/types.js";

function selectedOAuthProviders(state: CliState): string[] {
  const providers = state.oauthProviders?.filter((provider) =>
    provider === "google" || provider === "github"
  );

  return providers ?? ["google", "github"];
}

function oauthProviderLabel(state: CliState): string {
  return selectedOAuthProviders(state)
    .map((provider) => provider === "github" ? "GitHub" : "Google")
    .join("/");
}

function authLabel(state: CliState): string {
  if (state.authMode === "base") return "JWT";
  if (state.authMode === "auth") return "Email and password";
  const providers = oauthProviderLabel(state);
  return providers ? `Email, password, and ${providers}` : "Email and password";
}

function presetLabel(state: CliState): string {
  if (state.authMode === "fullstack") return "Full-stack application";
  if (state.authMode === "auth-oauth") return "Express API + OAuth";
  if (state.authMode === "auth") return "Express API + email/password";
  return "Express API (JWT only)";
}

function databaseLabel(state: CliState): string {
  if (!state.usePrisma) return "None";
  return state.database === "postgresql" ? "PostgreSQL with Prisma" : "SQLite with Prisma";
}

function runCommand(state: CliState, script: string): string {
  return runScriptCommand(state.packageManager ?? "npm", script);
}

export type SeedAdminCredentials = {
  email: string;
  password: string;
};

/**
 * Reads the dev-only seed administrator keys from the generated project's
 * .env. Only these two keys are surfaced; every other entry is discarded, so
 * JWKS, refresh, Redis, and OAuth secrets never reach the completion printout.
 */
export function readSeedAdminCredentials(
  projectDir: string,
): SeedAdminCredentials | undefined {
  const envPath = path.join(projectDir, ".env");
  if (!existsSync(envPath)) return undefined;
  const parsed = parseEnv(readFileSync(envPath, "utf8")) as Record<string, string | undefined>;
  const email = parsed.SEED_ADMIN_EMAIL?.trim();
  const password = parsed.SEED_ADMIN_PASSWORD?.trim();
  if (!email || !password) return undefined;
  return { email, password };
}

function printLovableSummary(state: CliState): void {
  const packageManager = state.packageManager ?? "npm";
  const details: Array<[string, string]> = [
    ["Location", `./${state.projectName}`],
    ["Preset", presetLabel(state)],
    ["Authentication", authLabel(state)],
    ["Database", databaseLabel(state)],
    ["Frontend", "Lovable + React reference"],
    ["Package manager", packageManager],
  ];
  const labelWidth = Math.max(...details.map(([label]) => label.length));

  console.log("");
  console.log(`${chalk.green("◆")} ${chalk.green.bold("Authenik8 with Lovable is ready.")}`);
  console.log(chalk.dim("│"));
  for (const [label, value] of details) {
    console.log(`${chalk.green("◇")}  ${chalk.dim(label.padEnd(labelWidth))}  ${value}`);
  }
  console.log(chalk.dim("│"));
  console.log(`${chalk.cyan("└")} ${chalk.bold("Next steps")}`);
  [
    `cd ${state.projectName}`,
    ...(state.installDeps === false ? [installCommand(packageManager)] : []),
    runCommand(state, "dev:lovable"),
    "Open integrations/lovable/START_HERE.md and use ChatGPT with the Authenik8 MCP app and Lovable.",
  ].forEach((step, index) => {
    console.log(`  ${chalk.cyan(`${index + 1}.`)} ${step}`);
  });

  console.log(chalk.dim("\n  API  http://localhost:3000/api"));
  console.log(chalk.dim("  See integrations/lovable/START_HERE.md"));
  console.log(chalk.dim("\n  Review .env, authenik8.json, README.md, and THREAT_MODEL.md before deployment.\n"));
}

export function printSummary(
  state: CliState,
  isProduction: boolean,
  hasDockerCompose = true,
  hasDockerDaemon = true,
  credentials?: SeedAdminCredentials,
): void {
  if (state.authMode === "fullstack" && state.frontend === "lovable") {
    printLovableSummary(state);
    return;
  }

  const packageManager = state.packageManager ?? "npm";
  const firstSuccess = firstSuccessGuide(state.authMode ?? "base");
  const isFullstack = state.authMode === "fullstack";
  const needsPostgres = !isFullstack
    && state.usePrisma
    && state.database === "postgresql";
  const commands = [
    `cd ${state.projectName}`,
    ...(state.installDeps === false ? [installCommand(packageManager)] : []),
    ...(needsPostgres && hasDockerCompose && hasDockerDaemon
      ? [runCommand(state, "docker:up")]
      : []),
    ...(!isFullstack && state.usePrisma ? [runCommand(state, "db:migrate")] : []),
    doctorCommand(packageManager),
    runCommand(state, "dev"),
  ];
  const details: Array<[string, string]> = [
    ["Location", `./${state.projectName}`],
    ["Preset", presetLabel(state)],
    ["Authentication", authLabel(state)],
    ["Database", databaseLabel(state)],
    ...(state.authMode === "fullstack"
      ? [["Frontend", "React reference"] as [string, string]]
      : []),
    ["Package manager", packageManager],
  ];
  const labelWidth = Math.max(...details.map(([label]) => label.length));

  console.log("");
  console.log(`${chalk.green("◆")} ${chalk.green.bold(`${state.projectName} is ready`)}`);
  console.log(chalk.dim("│"));
  for (const [label, value] of details) {
    console.log(`${chalk.green("◇")}  ${chalk.dim(label.padEnd(labelWidth))}  ${value}`);
  }
  console.log(chalk.dim("│"));
  if (needsPostgres && !hasDockerCompose) {
    console.log(
      `${chalk.yellow("!")}  Docker Compose was not found. Install it or provide PostgreSQL through DATABASE_URL.`,
    );
    console.log(chalk.dim("│"));
  } else if (needsPostgres && !hasDockerDaemon) {
    console.log(
      `${chalk.yellow("!")}  Docker is installed, but its daemon is not reachable. Start Docker Desktop or the Docker service.`,
    );
    console.log(chalk.dim("│"));
  }
  console.log(`${chalk.cyan("└")} ${chalk.bold("Next steps")}`);
  for (const command of commands) {
    console.log(`  ${chalk.cyan(command)}`);
  }

  console.log(chalk.dim("│"));
  console.log(`${chalk.cyan("└")} ${chalk.bold("First success")}`);
  console.log(`  ${chalk.bold(firstSuccess.title)}`);
  firstSuccess.steps.forEach((step, index) => {
    console.log(`  ${chalk.cyan(`${index + 1}.`)} ${step}`);
  });

  if (state.authMode === "fullstack") {
    console.log(chalk.dim("\n  Web  http://localhost:5173"));
    console.log(chalk.dim("  API  http://localhost:3000/api"));
    if (state.frontend !== "lovable" && credentials) {
      console.log(chalk.dim("│"));
      console.log(`${chalk.cyan("└")} ${chalk.bold("First run")}`);
      console.log(`  ${chalk.dim("Sign in  ")}http://localhost:5173/login`);
      console.log(`  ${chalk.dim("Admin    ")}${credentials.email} / ${credentials.password}`);
      console.log(chalk.dim("  Change SEED_ADMIN_PASSWORD before sharing or deploying."));
      console.log(chalk.dim("  Try the signed-in API from the project directory:"));
      console.log(chalk.dim("    1. curl -s -c .authenik8.cookies http://localhost:3000/api/auth/csrf"));
      console.log(chalk.dim("    2. curl -s -b .authenik8.cookies -X POST http://localhost:3000/api/auth/login \\"));
      console.log(chalk.dim("      -H 'content-type: application/json' -H 'X-CSRF-Token: <token-from-step-1>' \\"));
      console.log(chalk.dim(`      -d '{"email":"${credentials.email}","password":"${credentials.password}"}'`));
      if (state.demo) {
        console.log(chalk.dim("  Demo data: three demo projects are waiting after the first dev seed."));
      }
    }
  }
  if (state.authMode === "fullstack" && state.frontend === "lovable") {
    console.log("");
    console.log(chalk.bold("  Authenik8 backend and Lovable integration pack are ready."));
    [
      "Start and test the generated API.",
      "Open integrations/lovable/README.md.",
      "Connect your Lovable project to GitHub.",
      "Give Lovable LOVABLE_PROMPT.md and openapi.json.",
      `Run ${runCommand(state, "doctor:lovable")} before deployment.`,
    ].forEach((step, index) => {
      console.log(`  ${chalk.cyan(`${index + 1}.`)} ${step}`);
    });
  }
  if (state.authMode === "auth-oauth") {
    console.log(chalk.dim(`\n  Configure ${oauthProviderLabel(state)} OAuth credentials in .env before testing sign-in.`));
  }
  if (isProduction && state.authMode !== "fullstack") {
    console.log(chalk.dim(`\n  Production process  ${runCommand(state, "pm2:start")}`));
  }

  console.log(chalk.dim("\n  Review .env, authenik8.json, README.md, and THREAT_MODEL.md before deployment.\n"));
}
