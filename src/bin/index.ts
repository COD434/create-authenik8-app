#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { ExitPromptError } from "@inquirer/core";
import { fileURLToPath } from "url";

import type { StepName } from "../lib/types.js";
import { parseCliArguments } from "../lib/args.js";
<<<<<<< HEAD
import { resolveNonInteractiveAnswers } from "../lib/nonInteractive.js";
import { writeProjectManifest } from "../lib/projectManifest.js";
import { runPostGenerationDoctor } from "../commands/doctor/postGeneration.js";
=======
>>>>>>> main
import { initState, saveState, loadState, clearState, hasReachedStep, getState } from "../lib/state.js";
import {
  dockerComposeAvailable,
  dockerDaemonAvailable,
  killAllProcesses,
} from "../lib/process.js";
import { assertPresetRequirements } from "../lib/preflight.js";
import { projectNameError } from "../lib/projectName.js";
import { configuredCliStateSchema, firstZodIssue } from "../lib/schemas.js";
import {
<<<<<<< HEAD
  canResumeSetup,
  interruptionExitCode,
  restartCommand,
  type ShutdownSignal,
} from "../lib/interruption.js";
import {
=======
>>>>>>> main
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
<<<<<<< HEAD
import { configureGeneratedReadme } from "../steps/configureReadme.js";
=======
>>>>>>> main
import {
  installDependencies,
  isPackageManagerAvailable,
  resolvePackageManagerForPreset,
} from "../steps/installDeps.js";
import { configureProduction, initGit, appendProductionReadme, resolveRuntime } from "../steps/finalSetup.js";
import { printSummary } from "../utils/output.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function writeText(stream: { fd: number }, value: string): void {
  fs.writeSync(stream.fd, value);
}

function writeLine(stream: { fd: number }, value: string): void {
  writeText(stream, `${value}\n`);
}

const args = process.argv.slice(2);

let cliArguments: ReturnType<typeof parseCliArguments>;
try {
  cliArguments = parseCliArguments(args);
} catch (error) {
  writeLine(process.stderr, chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
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
  writeText(process.stdout, `
AUTHENIK8
Secure application scaffolding

Usage:
  create-authenik8-app <project-name> [options]
<<<<<<< HEAD
  create-authenik8-app create <project-name> [options]
  create-authenik8-app doctor [directory] [--json] [--skip-services]
  create-authenik8-app add <recipe> [directory] [--dry-run]
  create-authenik8-app upgrade [directory] [--check] [--json]

Options:
  --package-manager <npm|pnpm|bun>  Select the installer for Express presets
  --non-interactive, --yes          Generate without prompts (requires --preset)
  --preset <base|auth|auth-oauth|fullstack>
                                    Select a preset non-interactively
  --prisma, --no-prisma             Choose Prisma for the base preset
  --database <sqlite|postgresql>    Select a database where applicable
  --oauth <google|github|google,github>
  --no-oauth                        Explicitly disable OAuth for fullstack
  --git, --no-git                   Choose Git initialization (defaults off)
  --runtime <node|bun>              Runtime for --production-ready Express apps
=======

Options:
  --package-manager <npm|pnpm|bun>  Select the installer for Express presets
>>>>>>> main
  --resume                          Resume an interrupted setup
  --no-install                      Generate without installing dependencies
  --production-ready                Configure PM2 for Express API presets
  -v, --version                     Print the CLI version
  -h, --help                        Show this help message

Presets:
<<<<<<< HEAD
  fullstack    Recommended connected React + Express app
               Requires npm; local PostgreSQL and Redis run in process
  base         JWT boundary for applications with their own identity source
               Requires Redis; Prisma and a database are optional
  auth         Email/password Express API
               Requires Redis, Prisma, and SQLite or PostgreSQL
  auth-oauth   Password + Google/GitHub Express API
               Requires provider credentials, Redis, Prisma, and a database

Requirements:
  Node.js 20.19+, 22.12+, or 24+. Fullstack uses npm workspaces.

Example:
  npx create-authenik8-app my-app
  npx create-authenik8-app my-api --yes --preset auth --database postgresql --no-git
=======
  Express API (JWT only)
  Express API + email/password
  Express API + OAuth
  Full-stack application (React, Express, Prisma, PostgreSQL, Redis)

Example:
  npx create-authenik8-app my-app
>>>>>>> main

Full-stack applications use npm workspaces. Set AUTHENIK8_VERBOSE=1 to show installer output.
`);
}

if (cliArguments.help) {
  printHelp();
  process.exit(0);
}

if (cliArguments.version) {
  writeLine(process.stdout, readCliVersion());
  process.exit(0);
}

const projectNameArg = cliArguments.projectName;

if (!projectNameArg) {
  writeLine(process.stderr, chalk.red("Error: A project name is required."));
  writeLine(process.stderr, "Usage: create-authenik8-app <project-name> [options]");
  process.exit(1);
}

const projectName: string = projectNameArg;
const invalidProjectName = projectNameError(projectName);
if (invalidProjectName) {
  writeLine(process.stderr, chalk.red(`Error: Invalid project name "${projectName}". ${invalidProjectName}`));
  process.exit(1);
}
const skipInstall = cliArguments.skipInstall;
<<<<<<< HEAD
let isProduction = cliArguments.productionReady;
=======
const isProduction = cliArguments.productionReady;
>>>>>>> main
const isResume = cliArguments.resume;
const targetDir = path.resolve(process.cwd(), projectName);
const templateRoot = [
  path.resolve(__dirname, "../../../templates"),
  path.resolve(__dirname, "../../templates"),
].find((candidate) => fs.existsSync(candidate)) ?? path.resolve(__dirname, "../../../templates");
const globalStateDir = path.join(process.cwd(), ".authenik8");
const stateFile = path.join(globalStateDir, `${projectName}.json`);
let shuttingDown = false;

const handleShutdown = (signal: ShutdownSignal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("\n");
  spinner.stop();
  killAllProcesses();

  console.log(chalk.yellow("Setup interrupted."));
<<<<<<< HEAD
  let canResume = false;
  let restartPackageManager = cliArguments.packageManager;
  let restartWithoutInstall = skipInstall;
  let restartProductionReady = isProduction;
=======
>>>>>>> main
  try {
    const current = getState();
    const saved = current.step === "start" ? loadState(stateFile) : null;
    const restartState = saved ?? current;
    canResume = canResumeSetup(restartState.step);
    restartPackageManager ??= restartState.packageManager;
    restartWithoutInstall ||= restartState.installDeps === false;
    restartProductionReady ||= restartState.productionReady === true;
    if (canResume) {
      saveState({ ...restartState });
    }
  } catch (_) {}

<<<<<<< HEAD
  const command = restartCommand({
    projectName,
    productionReady: restartProductionReady,
    resume: canResume,
    skipInstall: restartWithoutInstall,
    ...(restartPackageManager ? { packageManager: restartPackageManager } : {}),
  });
  console.log(chalk.gray(canResume ? "Resume with:" : "Start again with:"));
  console.log(chalk.cyan(`   ${command}`));
=======
  console.log(chalk.gray("Resume with:"));
  console.log(chalk.cyan(`   npx create-authenik8-app ${projectName} --resume`));
>>>>>>> main

  process.exit(interruptionExitCode(signal));
};

<<<<<<< HEAD
process.prependListener("SIGINT", () => handleShutdown("SIGINT"));
process.prependListener("SIGTERM", () => handleShutdown("SIGTERM"));
=======
process.prependListener("SIGINT", handleShutdown);
process.prependListener("SIGTERM", handleShutdown);
>>>>>>> main

process.on("exit", () => {
  killAllProcesses();
});

let projectCreated = false;

initState({
  step: "start",
  projectName,
  installDeps: !skipInstall,
<<<<<<< HEAD
  productionReady: isProduction,
=======
>>>>>>> main
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
        writeLine(
          process.stderr,
          chalk.red(`Error: "${projectName}" contains an incomplete Authenik8 setup. Run again with --resume.`),
        );
      } else {
        writeLine(process.stderr, chalk.red(`Error: Directory "${projectName}" already exists.`));
      }
      process.exit(1);
    }

    if (isResume) {
      if (!savedState) {
        writeLine(process.stderr, chalk.red(`Error: No saved setup state found for "${projectName}".`));
        process.exit(1);
      }
<<<<<<< HEAD
      isProduction = isProduction || savedState.productionReady === true;
      initState({ ...savedState, productionReady: isProduction }, stateFile);
=======
      initState(savedState, stateFile);
>>>>>>> main
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
<<<<<<< HEAD
      const promptAnswers = cliArguments.nonInteractive
        ? resolveNonInteractiveAnswers(cliArguments, {
          bunAvailable: isPackageManagerAvailable("bun"),
        })
        : await runPrompts(getState(), isProduction);
=======
      const promptAnswers = await runPrompts(getState(), isProduction);
>>>>>>> main
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
<<<<<<< HEAD
    saveState({ packageManager, runtime });
=======
    saveState({ packageManager });
>>>>>>> main

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
        writeLine(process.stderr, errorMessage(err));
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

<<<<<<< HEAD
    const manifestState = configuredCliStateSchema.parse(getState());
    await writeProjectManifest(targetDir, {
      projectName,
      generatorVersion: readCliVersion(),
      preset: manifestState.authMode,
      packageManager: manifestState.packageManager,
      runtime: manifestState.runtime ?? "node",
      ...(manifestState.database ? { database: manifestState.database } : {}),
      usePrisma: manifestState.usePrisma,
      oauthProviders: manifestState.oauthProviders ?? [],
      productionReady: isProduction && manifestState.authMode !== "fullstack",
    });

=======
>>>>>>> main
    if (
      isProduction
      && getState().authMode !== "fullstack"
      && !hasReachedStep(currentStep, "production-configured")
    ) {
      startStep("production-configured");
<<<<<<< HEAD
      await configureProduction(targetDir, projectName, runtime, packageManager);
=======
      await configureProduction(targetDir, projectName, runtime);
>>>>>>> main
      saveState({
        step: "production-configured",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "production-configured";
      completeStep(currentStep);
    }

<<<<<<< HEAD
    if (isProduction && getState().authMode !== "fullstack") {
      appendProductionReadme(targetDir, projectName, packageManager);
    }
    await configureGeneratedReadme(targetDir, packageManager);

=======
>>>>>>> main
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
          skipStep("git-initialized", "optional Git setup unavailable");
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

<<<<<<< HEAD
    if (!hasReachedStep(currentStep, "project-validated")) {
      startStep("project-validated");
      const validation = await runPostGenerationDoctor(
        targetDir,
        getState().installDeps !== false,
      );
      completeStep("project-validated", `${validation.passed} checks passed`);
      if (validation.warnings > 0) {
        console.log(chalk.yellow(
          `! Static Doctor warnings: ${validation.warningLabels.join(", ")}`,
        ));
      }
      saveState({
        step: "project-validated",
        ...(getState().authMode !== "base" && { hashLib: selectedHash }),
      });
      currentStep = "project-validated";
    } else {
      skipStep("project-validated", "already completed");
    }

    finishSteps();

    // Done
=======
    finishSteps();

    // Done
    if (isProduction && getState().authMode !== "fullstack") {
      appendProductionReadme(targetDir, projectName);
    }

>>>>>>> main
    const hasDockerCompose = dockerComposeAvailable();
    printSummary(
      getState(),
      isProduction,
      hasDockerCompose,
      hasDockerCompose && dockerDaemonAvailable(),
    );

    saveState({ step: "done", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
    clearState();
  } catch (err) {
    if (err instanceof ExitPromptError) {
      throw err;
    }
    spinner.fail(spinner.text || "Setup failed");
    writeLine(process.stderr, chalk.red(`Error: ${errorMessage(err)}`));
    process.exit(1);
  }
}

try {
  await main();
} catch (err) {
  if (err instanceof ExitPromptError) {
    console.log(chalk.yellow("\nSetup cancelled. No project files were changed."));
    killAllProcesses();
    await cleanupIncompleteProject();
    process.exit(130);
  }
  writeLine(process.stderr, chalk.red(`\nUnexpected error: ${errorMessage(err)}`));
  await cleanupIncompleteProject();
  process.exit(1);
}
