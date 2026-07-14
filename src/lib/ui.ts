import chalk from "chalk";
import ora from "ora";
import type { CliState, StepName } from "./types.js";
import { stepLabels } from "./constants.js";

export const animatedProgress = Boolean(process.stderr.isTTY && !process.env.CI);
export const spinner = ora({ color: "cyan", isEnabled: animatedProgress });

function stepText(step: StepName, detail?: string): string {
  return detail ? `${stepLabels[step]} ${chalk.dim(`(${detail})`)}` : stepLabels[step];
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)}s`;
  return `${Math.round(durationMs / 1_000)}s`;
}

export function renderHeader(): void {
  console.log("");
  console.log(`${chalk.bgCyan.black.bold(" AUTHENIK8 ")} ${chalk.bold("create-authenik8-app")}`);
  console.log(chalk.dim(" Secure application scaffolding"));
  console.log("");
}

export async function showBootLogo(): Promise<void> {
  renderHeader();
}

export function renderConfiguration(state: CliState): void {
  const preset = state.authMode === "fullstack"
    ? "Full-stack application"
    : state.authMode === "auth-oauth"
      ? "Express API + OAuth"
      : state.authMode === "auth"
        ? "Express API + email/password"
        : "Express API (JWT only)";
  const database = state.usePrisma
    ? state.database === "postgresql" ? "PostgreSQL" : "SQLite"
    : "No database";
  const oauthProviders = (state.oauthProviders ?? ["google", "github"])
    .map((provider) => provider === "github" ? "GitHub" : "Google")
    .join(" + ");
  const authentication = state.authMode === "base"
    ? "JWT"
    : state.authMode === "auth"
      ? "Email and password"
      : oauthProviders ? `Email, password, and ${oauthProviders}` : "Email and password";
  const rows: Array<[string, string]> = [
    ["Project", state.projectName],
    ["Preset", preset],
    ["Authentication", authentication],
    ["Database", database],
    ["Package manager", state.packageManager ?? "npm"],
    ["Dependencies", state.installDeps === false ? "Skip installation" : "Install now"],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));

  console.log(`${chalk.cyan("◆")} ${chalk.bold("Project configuration")}`);
  console.log(chalk.dim("│"));
  for (const [label, value] of rows) {
    console.log(`${chalk.cyan("◇")}  ${chalk.dim(label.padEnd(labelWidth))}  ${value}`);
  }
  console.log(chalk.dim("│"));
}

export function startStep(step: StepName, detail?: string): void {
  const text = stepText(step, detail);
  if (animatedProgress) {
    spinner.start(text);
  } else {
    spinner.text = text;
  }
}

export function completeStep(step: StepName, detail?: string): void {
  const text = stepText(step, detail);
  if (animatedProgress) {
    spinner.succeed(text);
    return;
  }

  console.log(`${chalk.green("◇")} ${text}`);
}

export function skipStep(step: StepName, reason: string): void {
  spinner.stop();
  console.log(`${chalk.dim("◇")} ${stepLabels[step]} ${chalk.dim(`(${reason})`)}`);
}

export function finishSteps(): void {
  spinner.stop();
  console.log(chalk.dim("│"));
  console.log(`${chalk.green("└")} ${chalk.green.bold("Scaffold complete")}`);
}
