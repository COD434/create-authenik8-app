#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { execSync } from "child_process";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const projectName = process.argv[2];

if (!projectName) {
  console.log(chalk.red("❌ Please provide a project name"));
  process.exit(1);
}

const targetDir = path.join(process.cwd(), projectName);

async function main() {
  console.log(chalk.blue.bold("\n🚀 Authenik8 App Generator\n"));

  // 🔥 PROMPTS
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "framework",
      message: "Choose framework:",
      choices: ["Express", "Fastify (coming soon)"],
    },
    {
      type: "confirm",
      name: "usePrisma",
      message: "Use Prisma?",
      default: true,
    },
    {
      type: "confirm",
      name: "useGit",
      message: "Initialize git?",
      default: true,
    },
  ]);

  // 🚫 Prevent overwrite
  if (fs.existsSync(targetDir)) {
    console.log(chalk.red("\n❌ Folder already exists"));
    process.exit(1);
  }

  console.log(chalk.cyan("\n⚙️ Setting things up...\n"));

const templateRoot = path.resolve(__dirname, "../../templates");

const templatePath =
  answers.framework === "Express"
    ? path.join(templateRoot, "express-ts")
    : path.join(templateRoot, "express-ts"); // fallback for now

  // 📁 Create project (SPINNER)
  const createSpinner = ora("Creating project structure...").start();

  try {
    await fs.copy(templatePath, targetDir);
    createSpinner.succeed("Project files created");
  } catch (err) {
    createSpinner.fail("Failed to create project");
    console.error(err);

    process.exit(1);
  }


  if (answers.usePrisma) {
    const prismaSpinner = ora("Adding Prisma setup...").start();

    try {
      await fs.copy(
        path.join(__dirname, "../../templates"),
        path.join(targetDir, "prisma")
      );
      prismaSpinner.succeed("Prisma configured");
    } catch (err) {
      prismaSpinner.fail("Failed to setup Prisma");
    }
  }

  // 
  const installSpinner = ora("Installing dependencies...").start();

  try {
    execSync("npm install", {
      cwd: targetDir,
      stdio: "ignore",
    });
    installSpinner.succeed("Dependencies installed");
  } catch (err) {
    installSpinner.fail("Failed to install dependencies");
    console.error(err);
    process.exit(1);
  }

  
  if (answers.useGit) {
    const gitSpinner = ora("Initializing git...").start();

    try {
      execSync("git init", {
        cwd: targetDir,
        stdio: "ignore",
      });
      gitSpinner.succeed("Git initialized");
    } catch (err) {
      gitSpinner.fail("Git init failed");
    }
  }
  console.log(chalk.green.bold("\n🎉 Authenik8 app created successfully!\n"));

  console.log(chalk.white(`
Next steps:

  cd ${projectName}
  cp .env.example .env
  npm run dev

🔥 Your Authenik8 server is ready to go!
`));
}

main();
