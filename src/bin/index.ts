#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { ExitPromptError } from "@inquirer/core";
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
const isProduction = process.argv.includes("--production-ready");

const targetDir = path.join(process.cwd(), projectName);
let projectCreated = false






                const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanLogo = `

 █████╗      █████╗
██╔══██╗    ██╔══██╗
███████║    ╚█████╔╝
██╔══██║    ██╔══██╗
██║  ██║    ╚█████╔╝
╚═╝  ╚═╝     ╚════╝

     A8
Authenik8 CLI
 Build  Faster
 More , Secure
`;
const glitchFrames = [
`
       █████╗      █████╗
      ██╔══██╗    ██▒▒▒▒██
      ███████║    ╚█████╔╝
      ██╔══██║    ██▒▒▒▒██
      ██║  ██║    ╚█████╔╝
      ╚═╝  ╚═╝     ╚════╝

           A8
      Authenik8 CLI

      More
`,
`
       ██▓▓██╗    ██▓▓██╗
      ██▒▒██╔╝    ██▒▒██╔╝
      ██▒▒▒▒██    ╚█████╔╝
      ██▓▓██╔╝    ██▒▒██╗
      ██▒▒██║     ╚█████╔╝
      ╚═════╝      ╚════╝

           A8
      Authenik8 CLI
             Faster
`,
`
       ██▒▒██╗    ██▒▒██╗
      ██▓▓██╔╝    ██▓▓██╔╝
      ██▒▒▒▒██    ╚█████╔╝
      ██▓▓██╔╝    ██▓▓██╗
      ██▒▒██║     ╚█████╔╝
      ╚═════╝      ╚════╝

           A8
      Authenik8 CLI
      Build
`,
`
       ██▓▓██╗    ██▓▓██╗
      ██▒▒██╔╝    ██▒▒██╔╝
      ██▒▒▒▒██    ╚█████╔╝
      ██▓▓██╔╝    ██▒▒██╗
      ██▒▒██║     ╚█████╔╝
      ╚═════╝      ╚════╝

           A8
      Authenik8 CLI

`
];

async function showBootLogo() {
  console.clear();

  const boot = ora("Initializing Authenik8 engine...").start();

  // Phase 1: clean → unstable
  console.clear();
  console.log(chalk.cyan(cleanLogo));
  await sleep(200);

  // Phase 2: glitch burst (irregular feel)
  for (let i = 0; i < 5; i++) {
    console.clear();
    const frame =
      glitchFrames[Math.floor(Math.random() * glitchFrames.length)];
    console.log(chalk.cyan(frame));
    await sleep(120 + Math.random() * 120);
  }

  // Phase 3: stabilization flicker
  for (let i = 0; i < 2; i++) {
    console.clear();
    console.log(chalk.cyan(cleanLogo));
    await sleep(180);
    console.clear();
    console.log(chalk.gray(cleanLogo));
    await sleep(120);
  }

  // Final render
  console.clear();
  console.log(chalk.cyan.bold(cleanLogo));

  await sleep(800);
  boot.succeed("Engine ready");
}


async function main(){
	await showBootLogo();

  if (process.argv.includes("--help")) {
  console.log(`
Authenik8 CLI

Usage:
  create-authenik8-app <project-name>

Options:
  --help              Show this help message
  --production-ready  production mode
Features:
  - Express backend (default)
  - Optional Prisma ORM
  - PostgreSQL (production)
  - SQLite (quick start)
  - Optional Git initialization
  - Optional OAuth

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
    { name: "PostgreSQL", value: "postgresql(recommended for auth)" },
    { name: "SQLite (quick start, limited features)", value: "sqlite" }
  ],
    when: (answers) => answers.usePrisma,
    },
    {
      type: "confirm",
      name: "useGit",
      message: "Initialize git?",
      default: true,
    },{
  type: "list",
  name: "authMode",
  message: "Choose authentication setup:",
  choices: [
    { name: "JWT only (no auth routes)", value: "base" },
    { name: "Email + Password Auth", value: "auth" },
    { name: "Full Auth (Password + OAuth)", value: "auth-oauth" },
  ],
}
  ]);

  // 🚫 Prevent overwrite
  if (fs.existsSync(targetDir)) {
    console.log(chalk.red("\n❌ Folder already exists"));
    process.exit(1);
  }

  console.log(chalk.cyan("\n⚙️ Setting things up...\n"));


const templateRoot = path.resolve(__dirname, "../../templates");

let templateName = "express-base";

if (answers.authMode === "auth") {
  templateName = "express-auth";
}

if (answers.authMode === "auth-oauth") {
  templateName = "express-auth+";
}


const templatePath = path.join(templateRoot, templateName);


  // 📁 Create project (SPINNER)
  const createSpinner = ora("Creating project structure...").start();

  try {
    await fs.copy(templatePath, targetDir);
    projectCreated = true
    createSpinner.succeed("Project files created");
  } catch (err) {
    createSpinner.fail("Failed to create project");
    console.error(err);

    process.exit(1);
  }

  if (answers.usePrisma) {
    const prismaSpinner = ora("Adding Prisma setup...").start();

    try {
    const dbType = answers.database ===
   "postgresql" ? "postgresql"
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

await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    // Inject dependencies
    pkg.dependencies = {
      ...pkg.dependencies,
      "@prisma/client": "5.22.0",
    };

    pkg.devDependencies = {
      ...pkg.devDependencies,
      prisma: "5.22.0",
    };

    // Add scripts
    pkg.scripts = {
      ...pkg.scripts,
      "prisma:generate": "prisma generate",
      "prisma:migrate": "prisma migrate dev",
    };

    prismaSpinner.succeed(`Prisma (${dbType}) configured`);
  } catch (err) {
    prismaSpinner.fail("Failed to setup Prisma");
    console.error(err);
  }

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

  if (answers.usePrisma) {
  const prismaGenSpinner = ora("Generating Prisma client...").start();

  try {
    execSync("npx prisma@5.22.0 generate", {
      cwd: targetDir,
      stdio: "ignore"
    });

    prismaGenSpinner.succeed("Prisma client generated");
  } catch (err) {
    prismaGenSpinner.fail("Failed to generate Prisma client");
    console.error(err);
  }
}

if (isProduction) {
  const pm2Spinner = ora("Setting up production mode (PM2)...").start();

  try {
    execSync("npm install pm2", {
      cwd: targetDir,
      stdio: "ignore",
    });

    pm2Spinner.succeed("PM2 installed (production-ready)");
  } catch (err) {
    pm2Spinner.fail("Failed to install PM2");
  }
}
if (answers.authMode !== "base") {

    const authSpinner = ora("Installing password auth...").start();

    try {
      execSync("npm install argon2", {
        cwd: targetDir,
        stdio: "ignore",
      });

      authSpinner.succeed("Password auth ready (argon2)");
    } catch (err) {
      authSpinner.fail("Failed to install password auth");
      console.error(err);
      process.exit(1);
    }
  }
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

  if (isProduction) {
  fs.appendFileSync(
    path.join(targetDir, "README.md"),
    `

## 🚀 Production Mode

This project is configured for production using PM2.

### Start app in cluster mode:
npm run pm2:start

### View logs:
npm run pm2:logs

### Stop app:
npm run pm2:stop

`
  );
}
  console.log(chalk.white(`
Next steps:

  cd ${projectName}
  redis-server --daemonize yes
  npm run dev

  Auth Features:
  ${
    answers.authMode === "base"
      ? "✓ JWT only"
      : answers.authMode === "auth"
      ? "✓ Email + Password"
      : "✓ Password + OAuth (Google/GitHub)"
  }
  

🛠 Stack:
  ✔ Express
  ✔ ${answers.usePrisma ? (answers.database.includes("postgresql") ? "PostgreSQL" : "SQLite") : "No database"}
  ✔ ${answers.usePrisma ? "Prisma ORM" : "No ORM"}

📡 Endpoints:
${
  answers.authMode === "base"
    ? `
  GET    /public
  GET    /guest
  GET    /protected
  POST   /refresh
`
    : answers.authMode === "auth"
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
  GET    /auth/google
  GET    /auth/github
  GET    /protected
`}


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
process.on("SIGINT", async () => {
  console.log("\n👋 Authenik8 setup cancelled.");

  if (projectCreated && fs.existsSync(targetDir)) {
    await fs.remove(targetDir);
    console.log("🧹 Cleaned up incomplete project.");
  }

  process.exit(0);
});

main().catch(async (err) => {
  if (err instanceof ExitPromptError) {
    console.log("\n👋 Authenik8 setup cancelled.");

    if (projectCreated && fs.existsSync(targetDir)) {
      await fs.remove(targetDir);
      console.log("🧹 Cleaned up incomplete project.");
    }

    process.exit(0);
  }

  console.error("\n❌ Unexpected error:");
  console.error(err);

  if (projectCreated && fs.existsSync(targetDir)) {
    await fs.remove(targetDir);
    console.log("🧹 Cleaned up incomplete project.");

  }
  process.exit(1)
})


