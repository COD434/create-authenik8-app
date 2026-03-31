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

  if (process.argv.includes("--help")) {
  console.log(`
Authenik8 CLI

Usage:
  create-authenik8-app <project-name>

Options:
  --help           Show this help message

Features:
  - Express backend (default)
  - Optional Prisma ORM
  - PostgreSQL (production)
  - SQLite (quick start)
  - Optional Git initialization

Examples:
  create-authenik8-app my-app
`);
  process.exit(0);
}

  console.log(chalk.gray(`
Available options:

  Frameworks:
    - Express

  Database (if Prisma enabled):
    - PostgreSQL
    - SQLite (quick start)

  Features:
    - Prisma ORM (optional)
    - Git initialization (optional)
`));

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
    type: "list",
    name: "database",
    message: "Choose database:",
    choices:[
    { name: "PostgreSQL", value: "postgresql" },
    { name: "SQLite (quick start)", value: "sqlite" }
  ],
    when: (answers) => answers.usePrisma,
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
    const dbType = answers.database.toLowerCase().includes("post")
  ? "postgresql"
  : "sqlite";

    const prismaTemplatePath = path.join(
      templateRoot,
      `prisma/${dbType}`
    );

    // Copy prisma schema
    await fs.copy(
     path.join(prismaTemplatePath, "schema.prisma"),
      path.join(targetDir, "prisma/schema.prisma")
    );

    // Copy env
    await fs.copy(
      path.join(prismaTemplatePath, ".env"),
      path.join(targetDir, ".env")
    );

    const pkgPath = path.join(targetDir, "package.json");
const pkg = await fs.readJson(pkgPath);

    // Inject dependencies
    pkg.dependencies = {
      ...pkg.dependencies,
      "@prisma/client": "^5.0.0",
    };

    pkg.devDependencies = {
      ...pkg.devDependencies,
      prisma: "^5.0.0",
    };

    // Add scripts
    pkg.scripts = {
      ...pkg.scripts,
      "prisma:generate": "prisma generate",
      "prisma:migrate": "prisma migrate dev",
    };

    prismaSpinner.succeed(`Prisma (${answers.database}) configured`);
  } catch (err) {
    prismaSpinner.fail("Failed to setup Prisma");
    console.error(err);
  }
}

  // 
  const installSpinner = ora("Installing dependencies...(this may take a few minutes)").start();

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
