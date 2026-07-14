#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { ExitPromptError } from "@inquirer/core";
import { fileURLToPath } from "url";

import type { StepName } from "../lib/types.js";
import { parseCliArguments } from "../lib/args.js";
import { initState, saveState, loadState, clearState, hasReachedStep, getState } from "../lib/state.js";
import { killAllProcesses } from "../lib/process.js";
import { assertPresetRequirements } from "../lib/preflight.js";
import { projectNameError } from "../lib/projectName.js";
import { configuredCliStateSchema, firstZodIssue } from "../lib/schemas.js";
import {
  completeStep,
  finishSteps,
  formatDuration,
  renderConfiguration,
  showBootLogo,
  skipStep,
  spinner,
  startStep,
} from "../lib/ui.js";

import { runPrompts } from "../steps/prompts.js";
import { createProject, configurePackageJson } from "../steps/createProject.js";
import { installAuth } from "../steps/installAuth.js";
import { configurePrisma } from "../steps/configurePrisma.js";
import {
  installDependencies,
  isPackageManagerAvailable,
  resolvePackageManagerForPreset,
} from "../steps/installDeps.js";
import { configureProduction, initGit, appendProductionReadme, resolveRuntime } from "../steps/finalSetup.js";
import { printSummary } from "../utils/output.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);

let cliArguments: ReturnType<typeof parseCliArguments>;
try {
  cliArguments = parseCliArguments(args);
} catch (error) {
  console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
}

function readCliVersion(): string {
  const packagePath = [
    path.resolve(__dirname, "../../../package.json"),
    path.resolve(__dirname, "../../package.json"),
  ].find((candidate) => fs.existsSync(candidate));

  if (!packagePath) return "unknown";
  return (fs.readJsonSync(packagePath) as { version?: string }).version ?? "unknown";
}

function printHelp(): void {
  console.log(`
AUTHENIK8
Secure application scaffolding

Usage:
  create-authenik8-app <project-name> [options]

Options:
  --package-manager <npm|pnpm|bun>  Select the installer for Express presets
  --resume                          Resume an interrupted setup
  --no-install                      Generate without installing dependencies
  --production-ready                Configure PM2 for Express API presets
  -v, --version                     Print the CLI version
  -h, --help                        Show this help message

Presets:
  Express API (JWT only)
  Express API + email/password
  Express API + OAuth
  Full-stack application (React, Express, Prisma, PostgreSQL, Redis)

Example:
  npx create-authenik8-app my-app

Full-stack applications use npm workspaces. Set AUTHENIK8_VERBOSE=1 to show installer output.
`);
}

if (cliArguments.help) {
  printHelp();
  process.exit(0);
}

if (cliArguments.version) {
  console.log(readCliVersion());
  process.exit(0);
}

const projectNameArg = cliArguments.projectName;

if (!projectNameArg) {
  console.error(chalk.red("Error: A project name is required."));
  console.error("Usage: create-authenik8-app <project-name> [options]");
  process.exit(1);
}

const projectName: string = projectNameArg;
const invalidProjectName = projectNameError(projectName);
if (invalidProjectName) {
  console.error(chalk.red(`Error: Invalid project name "${projectName}". ${invalidProjectName}`));
  process.exit(1);
}
const skipInstall = cliArguments.skipInstall;
const isProduction = cliArguments.productionReady;
const isResume = cliArguments.resume;
const targetDir = path.resolve(process.cwd(), projectName);
const templateRoot = [
  path.resolve(__dirname, "../../../templates"),
  path.resolve(__dirname, "../../templates"),
].find((candidate) => fs.existsSync(candidate)) ?? path.resolve(__dirname, "../../../templates");
const globalStateDir = path.join(process.cwd(), ".authenik8");
const stateFile = path.join(globalStateDir, `${projectName}.json`);
let shuttingDown = false;

const handleShutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("\n");
  spinner.stop();
  killAllProcesses();

  console.log(chalk.yellow("Setup interrupted."));
  try {
    const current = getState();
    if (current && current.step && current.step !== "done") {
      saveState({ ...current });
    }
  } catch (_) {}

  console.log(chalk.gray("Resume with:"));
  console.log(chalk.cyan(`   npx create-authenik8-app ${projectName} --resume`));

  process.exit(0);
};

process.prependListener("SIGINT", handleShutdown);
process.prependListener("SIGTERM", handleShutdown);

process.on("exit", () => {
  killAllProcesses();
});

let projectCreated = false;

initState({
  step: "start",
  projectName,
  installDeps: !skipInstall,
  ...(cliArguments.packageManager ? { packageManager: cliArguments.packageManager } : {}),
}, stateFile);

async function cleanupIncompleteProject(): Promise<void> {
  if (projectCreated && fs.existsSync(targetDir)) {
    await fs.remove(targetDir);
    console.log("Removed the incomplete project directory.");
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return process.env.AUTHENIK8_DEBUG && error.stack ? error.stack : error.message;
  }
  return String(error);
}

async function main() {
  try {
    await showBootLogo();

    const savedState = loadState(stateFile);
    let currentStep: StepName = "start";

    if (!isResume && fs.existsSync(targetDir)) {
      if (savedState) {
        console.error(
          chalk.red(`Error: "${projectName}" contains an incomplete Authenik8 setup. Run again with --resume.`),
        );
      } else {
        console.error(chalk.red(`Error: Directory "${projectName}" already exists.`));
      }
      process.exit(1);
    }

    if (isResume) {
      if (!savedState) {
        console.error(chalk.red(`Error: No saved setup state found for "${projectName}".`));
        process.exit(1);
      }
      initState(savedState, stateFile);
      if (skipInstall) {
        saveState({ installDeps: false });
      } else if (savedState.installDeps === undefined) {
        saveState({ installDeps: !skipInstall });
      }
      if (cliArguments.packageManager) {
        saveState({ packageManager: cliArguments.packageManager });
      }
      currentStep = savedState.step;
      console.log(chalk.yellow(`\nResuming ${projectName} from "${currentStep}".\n`));
    } else {
      const promptAnswers = await runPrompts(getState(), isProduction);
      saveState({ ...promptAnswers, step: "prompts" });
      currentStep = "prompts";
    }

    const raw = getState();
    if (raw.authMode === "fullstack") {
      saveState({ usePrisma: true, database: "postgresql", runtime: "node" });
    } else if (["auth", "auth-oauth"].includes(raw.authMode ?? "") && !raw.usePrisma) {
      console.log(chalk.yellow("\nPassword and OAuth presets require Prisma; it has been enabled.\n"));
      saveState({ usePrisma: true, database: raw.database ?? "sqlite" });
    }

    const state = getState();
    assertPresetRequirements(state.authMode, state.usePrisma);
    const runtime = resolveRuntime(state.runtime);
    const requestedPackageManager = cliArguments.packageManager ?? state.packageManager;
    const packageManager = resolvePackageManagerForPreset(
      state.authMode,
      requestedPackageManager,
    );
    if (state.installDeps !== false && !isPackageManagerAvailable(packageManager)) {
      throw new Error(`${packageManager} is not available on PATH. Install it or choose another package manager.`);
    }
    saveState({ packageManager });

    if (state.usePrisma) {
      if (!state.database) saveState({ database: "sqlite" });
    }

    const configuredState = configuredCliStateSchema.safeParse(getState());
    if (!configuredState.success) {
      throw new Error(firstZodIssue(configuredState.error));
    }

    renderConfiguration(configuredState.data);

    // Project scaffold
    if (!hasReachedStep(currentStep, "project-created")) {
      startStep("project-created");
      try {
        await createProject(getState(), targetDir, templateRoot);
        projectCreated = true;
        saveState({ step: "project-created" });
        currentStep = "project-created";
        completeStep(currentStep);
      } catch (err) {
        spinner.fail("Could not create project files");
        console.error(err);
        process.exit(1);
      }
    } else {
      skipStep("project-created", "already completed");
    }

    // Auth install
    let selectedHash: "bcryptjs" = "bcryptjs";
    if (!hasReachedStep(currentStep, "auth-installed")) {
      startStep("auth-installed");
      if (getState().authMode !== "base" && getState().authMode !== "fullstack") {
        selectedHash = await installAuth(targetDir, packageManager);
      }
      saveState({
        step: "auth-installed",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "auth-installed";
      completeStep(currentStep);
    } else {
      selectedHash = savedState?.hashLib ?? selectedHash;
      skipStep("auth-installed", "already completed");
    }

    // Prisma config
    if (!hasReachedStep(currentStep, "prisma-configured")) {
      startStep("prisma-configured");
      await configurePrisma(getState(), targetDir, templateRoot);
      saveState({
        step: "prisma-configured",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "prisma-configured";
      completeStep(currentStep);
    } else {
      skipStep("prisma-configured", "already completed");
    }

    if (
      isProduction
      && getState().authMode !== "fullstack"
      && !hasReachedStep(currentStep, "production-configured")
    ) {
      startStep("production-configured");
      await configureProduction(targetDir, projectName, runtime);
      saveState({
        step: "production-configured",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "production-configured";
      completeStep(currentStep);
    }

    // Install dependencies
    if (!hasReachedStep(currentStep, "deps-installed")) {
      configurePackageJson(targetDir, getState().usePrisma ?? false, packageManager);

      if (getState().installDeps !== false) {
        startStep("deps-installed");
        const installResult = await installDependencies(targetDir, packageManager);
        completeStep(
          "deps-installed",
          `${installResult.packageManager}, ${formatDuration(installResult.durationMs)}`,
        );
      } else {
        skipStep("deps-installed", "requested with --no-install");
      }
      saveState({
        step: "deps-installed",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "deps-installed";
    } else {
      skipStep("deps-installed", "already completed");
    }

    // Git init
    if (!hasReachedStep(currentStep, "git-initialized")) {
      if (getState().useGit) {
        startStep("git-initialized");
        const initialized = await initGit(targetDir);
        if (initialized) {
          completeStep("git-initialized");
        } else {
          skipStep("git-initialized", "Git is not installed");
        }
      } else {
        skipStep("git-initialized", "not selected");
      }
      saveState({
        step: "git-initialized",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "git-initialized";
    } else {
      skipStep("git-initialized", "already completed");
    }

    finishSteps();

    // Done
    if (isProduction && getState().authMode !== "fullstack") {
      appendProductionReadme(targetDir, projectName);
    }

    printSummary(getState(), isProduction);

    saveState({ step: "done", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
    clearState();
  } catch (err) {
    if (err instanceof ExitPromptError) {
      throw err;
    }
    spinner.fail(spinner.text || "Setup failed");
    console.error(chalk.red(`Error: ${errorMessage(err)}`));
    process.exit(1);
  }
}

main().catch(async (err) => {
  if (err instanceof ExitPromptError) {
    console.log(chalk.yellow("\nSetup cancelled. No project files were changed."));
    killAllProcesses();
    await cleanupIncompleteProject();
    process.exit(0);
  }
  console.error(chalk.red(`\nUnexpected error: ${errorMessage(err)}`));
  await cleanupIncompleteProject();
  process.exit(1);
});
