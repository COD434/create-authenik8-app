#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { ExitPromptError } from "@inquirer/core";
import { fileURLToPath } from "url";

import type { CliState, StepName } from "./lib/types.js";
import { initState, saveState, loadState, clearState, hasReachedStep, getState } from "./lib/state.js";
import { killAllProcesses, run, getCommand } from "./lib/process.js";
import { showBootLogo, renderStep, spinner } from "./lib/ui.js";

import { runPrompts } from "./steps/prompts.js";
import { createProject } from "./steps/createProject.js";
import { installAuth } from "./steps/installAuth.js";
import { configurePrisma } from "./steps/configurePrisma.js";
import { installDependencies, generatePrismaClient } from "./steps/installDeps.js";
import { configureProduction, initGit, appendProductionReadme,resolveRuntime } from "./steps/finalSetup.js";
import { printSummary } from "./utils/output.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const projectNameArg = args.find((arg) => !arg.startsWith("--"));

if (!projectNameArg) {
  console.log(chalk.red("❌ Please provide a project name\n Usage:\n npx create-authenik8-app <project-name>\n Run with --help for more info"));
  process.exit(1);
}

const projectName: string = projectNameArg;
const isProduction = args.includes("--production-ready");
const isResume = args.includes("--resume");
const targetDir = path.resolve(process.cwd(), projectName);
const templateRoot = path.resolve(__dirname, "../templates");
const globalStateDir = path.join(process.cwd(), ".authenik8");
const stateFile = path.join(globalStateDir, `${projectName}.json`);

let projectCreated = false;

initState({ step: "start", projectName }, stateFile);

async function cleanupIncompleteProject() {
  if (projectCreated && fs.existsSync(targetDir)) {
    await fs.remove(targetDir);
    console.log("🧹 Cleaned up incomplete project.");
  }
}

function assertRequired(value: any, name: string) {
  if (value === undefined || value === null || value === "") {
    console.log(`❌ Missing required input: ${name}`);
    process.exit(1);
  }
}

async function main() {
  process.on("SIGINT", async () => {
    console.log("\n");
    spinner.stop();
    killAllProcesses();
    console.log(chalk.yellow("⏸ Setup interrupted."));
    console.log(chalk.gray(`↻ Resume with: create-authenik8-app ${projectName} --resume`));
    process.exit(0);
  });

  try {
    await showBootLogo();

    if (args.includes("--help")) {
      console.log(`
Authenik8 CLI

Usage:
npx create-authenik8-app <project-name>

Options:
--resume            Resume project setup
--help              Show this help message
--production-ready  production mode

Features:
Express backend (default)
Optional Prisma ORM
PostgreSQL (production)
SQLite (quick start)
Optional Git initialization
Optional OAuth

Examples:
create-authenik8-app my-app
`);
      process.exit(0);
    }

    console.log(chalk.gray(`
Available options:
Authentication setup:
• base (JWT only)
• auth (JWT + Password/Email auth)
• auth-oauth(JWT+ Password/Email + oauth)

Frameworks:
• Express
• Fastify(coming soon)

Database (if Prisma enabled):
• PostgreSQL
• SQLite (quick start)

Features:
• Prisma ORM (optional)
• Git initialization (optional)
• OAuth + Auth
`));

    const savedState = loadState(stateFile);
    let currentStep: StepName = "start";

    if (!isResume && fs.existsSync(targetDir)) {
      if (savedState) {
        console.log(
          chalk.red(`❌ "${projectName}" already contains an incomplete Authenik8 setup. Run again with --resume.`)
        );
      } else {
        console.log(chalk.red(`❌ Directory "${projectName}" already exists.`));
      }
      process.exit(1);
    }

    if (isResume || fs.existsSync(stateFile)) {
      console.log(chalk.gray(`
Resumable steps:
✔ project scaffold
✔ auth install
✔ prisma setup
✔ deps install
✔ prisma generate
✔ git init
`));
    }

    if (isResume) {
      if (!savedState) {
        console.log(chalk.red(`❌ No saved setup state found for "${projectName}".`));
        process.exit(1);
      }
      initState(savedState, stateFile);
      currentStep = savedState.step;
      console.log(chalk.yellow(`\n↻ Resuming setup for ${projectName} from "${currentStep}"...\n`));
    } else {
      const promptAnswers = await runPrompts(getState());
      saveState({ ...promptAnswers, step: "prompts" });
      currentStep = "prompts";
    }

    const state = getState();

    assertRequired(state.framework, "framework");
    assertRequired(state.authMode, "authMode");
    if (state.usePrisma) {
      if (!state.database) saveState({ database: "sqlite" });
      assertRequired(getState().database, "database");
    }

    console.log(chalk.cyan("\nSetting up your project\n"));

    // Project scaffold 
    if (!hasReachedStep(currentStep, "project-created")) {
      renderStep("project-created", isProduction);
      try {
        await createProject(getState(), targetDir, templateRoot);
        projectCreated = true;
        saveState({ step: "project-created" });
        currentStep = "project-created";
        renderStep(currentStep, isProduction);
      } catch (err) {
        console.error(err);
        process.exit(1);
      }
    } else {
      console.log(chalk.gray("↷ Skipping project creation (already completed)"));
    }

    // Auth install
    let selectedHash = "bcryptjs";
    if (!hasReachedStep(currentStep, "auth-installed")) {
      if (getState().authMode !== "base") {
        selectedHash = await installAuth(targetDir);
      }
      renderStep("auth-installed", isProduction);
      saveState({ step: "auth-installed", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
      currentStep = "auth-installed";
      renderStep(currentStep, isProduction);
    } else {
      selectedHash = savedState?.hashLib ?? selectedHash;
      console.log(chalk.gray("↷ Skipping auth setup (already completed)"));
    }

    // Prisma config 
    if (!hasReachedStep(currentStep, "prisma-configured")) {
      await configurePrisma(getState(), targetDir, templateRoot);
      saveState({ step: "prisma-configured", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
      currentStep = "prisma-configured";
      renderStep(currentStep, isProduction);
    } else {
      console.log(chalk.gray("↷ Skipping Prisma/package setup (already completed)"));
    }

    //  Install deps
    if (!hasReachedStep(currentStep, "deps-installed")) {
      renderStep("deps-installed", isProduction);
      await installDependencies(targetDir);
      saveState({ step: "deps-installed", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
      currentStep = "deps-installed";
      renderStep(currentStep, isProduction);
    } else {
      await run(getCommand("npm"), ["install"], { cwd: targetDir, stdio: "inherit" });
    }

    //  Prisma generate 
    if (!hasReachedStep(currentStep, "prisma-generated")) {
      if (getState().usePrisma) {
        await generatePrismaClient(targetDir);
      }
      saveState({ step: "prisma-generated", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
      currentStep = "prisma-generated";
      renderStep(currentStep, isProduction);
    } else {
      console.log(chalk.gray("↷ Skipping Prisma client generation (already completed)"));
    }

    //  Production setup
    if (isProduction && !hasReachedStep(currentStep, "production-configured")) {
const state = getState();

 const runtime = resolveRuntime(state.runtime);


      await configureProduction(targetDir,projectName,runtime );
      saveState({ step: "production-configured", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
      currentStep = "production-configured";
      renderStep(currentStep, isProduction);
    }

    // Git init
    if (!hasReachedStep(currentStep, "git-initialized")) {
      if (getState().useGit) {
        renderStep("git-initialized", isProduction);
        await initGit(targetDir);
      }
      saveState({ step: "git-initialized", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
      currentStep = "git-initialized";
      renderStep("done", isProduction);
    } else {
      console.log(chalk.gray("↷ Skipping git init (already completed)"));
    }

    //  Done 
    if (isProduction) {
      appendProductionReadme(targetDir, projectName);
    }

    printSummary(getState(), isProduction);

    saveState({ step: "done", ...(getState().authMode !== "base" && { hashLib: selectedHash }) });
    clearState();
  } catch (err) {
    if (err instanceof ExitPromptError) {
      throw err;
    }
    console.error("Fatal error", err);
    process.exit(1);
  }
}

main().catch(async (err) => {
  if (err instanceof ExitPromptError) {
    console.log("\n👋 Authenik8 setup cancelled. You can --resume later");
    killAllProcesses();
    await new Promise((r) => setTimeout(r, 300));
    console.log(chalk.bgYellow.black(" SETUP CANCELLED "));
    await cleanupIncompleteProject();
    process.exit(0);
  }
  console.error(chalk.red("\n❌ Unexpected error:"), err);
  await cleanupIncompleteProject();
  process.exit(1);
});
