import chalk from "chalk";
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

export function printSummary(
  state: CliState,
  isProduction: boolean,
  hasDockerCompose = true,
  hasDockerDaemon = true,
): void {
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
  }
  if (state.authMode === "auth-oauth") {
    console.log(chalk.dim(`\n  Configure ${oauthProviderLabel(state)} OAuth credentials in .env before testing sign-in.`));
  }
  if (isProduction && state.authMode !== "fullstack") {
    console.log(chalk.dim(`\n  Production process  ${runCommand(state, "pm2:start")}`));
  }

  console.log(chalk.dim("\n  Review .env, authenik8.json, README.md, and THREAT_MODEL.md before deployment.\n"));
}
