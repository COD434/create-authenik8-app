#!/usr/bin/env node


import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { ExitPromptError } from "@inquirer/core";
import ora from "ora";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import os from "os";

type StepName =
| "start"
| "prompts"
| "project-created"
| "auth-installed"
| "prisma-configured"
| "deps-installed"
| "prisma-generated"
| "production-configured"
| "git-initialized"
| "done";

type CliState = {
step: StepName;
projectName: string;
framework?: string;
usePrisma?: boolean;
database?: string;
useGit?: boolean;
authMode?: string;
hashLib?: string;
};


let answers:any = {};


const platform = os.platform();
// 'linux' | 'darwin' | 'win32'

const isTermux =
process.env.PREFIX?.includes("com.termux") ||
process.env.TERMUX === "true";

function getBestHashLib() {
if (isTermux) return "bcryptjs"; // argon2 breaks here

if (platform === "win32") return "bcryptjs";
// avoids build tools issues for most users

if (platform === "darwin") return "argon2";
// mac usually fine

if (platform === "linux") return "argon2";
// but still fallback later if needed

return "bcryptjs";
}


function generateHashModule(hashLib: "argon2" | "bcryptjs") {
if (hashLib === "argon2") {
return `
import argon2 from "argon2";

export const hashPassword = (password: string) => {
return argon2.hash(password);
};

export const comparePassword = (password: string, hash: string) => {
return argon2.verify(hash, password);
};
`;
}

return `
import bcrypt from "bcryptjs";

export const hashPassword = (password: string) => {
return bcrypt.hash(password, 10);
};

export const comparePassword = (password: string, hash: string) => {
return bcrypt.compare(password, hash);
};
`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectName = process.argv[2];

if (!projectName) {
console.log(chalk.red("❌ Please provide a project name"));
process.exit(1);
}
const isProduction = process.argv.includes("--production-ready");
const isResume = process.argv.includes("--resume");

const targetDir = path.join(process.cwd(), projectName);
let projectCreated = false

const stepOrder: StepName[] = [
"start",
"prompts",
"project-created",
"auth-installed",
"prisma-configured",
"deps-installed",
"prisma-generated",
"production-configured",
"git-initialized",
"done",
];

const stateFile = path.join(targetDir, ".authenik8-state.json");

function hasReachedStep(currentStep: StepName, targetStep: StepName) {
return stepOrder.indexOf(currentStep) >= stepOrder.indexOf(targetStep);
}

function saveState(step: StepName, extra: Partial<CliState> = {}) {
fs.ensureDirSync(targetDir);
fs.writeJsonSync(stateFile, {
step,
projectName,
...answers,
...extra,
}, { spaces: 2 });
}

function loadState(): CliState | null {
if (!fs.existsSync(stateFile)) return null;
return fs.readJsonSync(stateFile) as CliState;
}

function clearState() {
if (fs.existsSync(stateFile)) {
fs.removeSync(stateFile);
}
}

function isInterruptedError(err: unknown) {
return (
typeof err === "object" &&
err !== null &&
"signal" in err &&
((err as { signal?: string }).signal === "SIGINT" ||
(err as { signal?: string }).signal === "SIGTERM")
);
}

function exitForInterrupt(err: unknown): never {
if (isInterruptedError(err)) {
throw err;
}

console.error(err);
process.exit(1);
}

async function cleanupIncompleteProject() {
if (projectCreated && fs.existsSync(targetDir)) {
  await fs.remove(targetDir);
  console.log("🧹 Cleaned up incomplete project.");
}
}


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
`
,  
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
`
,  
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
`
,  
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
process.on("SIGINT", async () => {
  console.log("\n👋 Authenik8 setup cancelled.");
  await cleanupIncompleteProject();
  process.exit(0);
});

try{
await showBootLogo();

if (process.argv.includes("--help")) {
console.log(`
Authenik8 CLI

Usage:
create-authenik8-app <project-name>

Options:
--resume            Resume project setup(in development)
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
const savedState = loadState();
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

if (isResume) {
if (!savedState) {
console.log(chalk.red(`❌ No saved setup state found for "${projectName}".`));
process.exit(1);
}

answers = {
framework: savedState.framework,
usePrisma: savedState.usePrisma,
database: savedState.database,
useGit: savedState.useGit,
authMode: savedState.authMode,
};
currentStep = savedState.step;

console.log(
chalk.yellow(`\n↻ Resuming setup for ${projectName} from "${currentStep}"...\n`)
);
} else {
answers = await inquirer.prompt([
{
type: "list",
name: "framework",
message: "Choose framework:",
choices: ["Express", "Fastify (coming soon)"],
default:  "Express",
},
{
type: "confirm",
name: "usePrisma",
message: "Use Prisma?",
default:  true,
},
{
type: "list",
name: "database",
message: "Choose database:",
choices:[
{ name: "PostgreSQL", value: "postgresql" },
{ name: "SQLite ", value: "sqlite" }
],
when: (answers) => answers.usePrisma,
default:  "sqlite",

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
{ name: "JWT only", value: "base" },
{ name: "Email + Password Auth", value: "auth" },
{ name: "Full Auth (Password + OAuth)", value: "auth-oauth" },
],
default:  "base"
}
]);
saveState("prompts");
currentStep = "prompts";
}

function assertRequired(value: any, name: string) {
if (value === undefined || value === null || value === "") {
console.log(`❌ Missing required input: ${name}`);
process.exit(1);
}
}

assertRequired(answers.framework, "framework");
assertRequired(answers.authMode, "authMode");

if (answers.usePrisma) {
if (!answers.database) {
answers.database = "sqlite";
}
assertRequired(answers.database, "database");
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
if (!hasReachedStep(currentStep, "project-created")) {
const createSpinner = ora("Creating project structure...").start();

try {
await fs.copy(templatePath, targetDir);
projectCreated = true

createSpinner.succeed("Project files created");
saveState("project-created");
currentStep = "project-created";

} catch (err) {
createSpinner.fail("Failed to create project");
console.error(err);

process.exit(1);

}
} else {
console.log(chalk.gray("↷ Skipping project creation (already completed)"));
}

let selectedHash = "bcryptjs"; // default safe fallback

if (!hasReachedStep(currentStep, "auth-installed")) {
if (answers.authMode !== "base") {
const authSpinner = ora("Installing password auth...").start();

selectedHash = getBestHashLib();
const installResult = spawnSync("npm" ,["install", selectedHash ],{
cwd: targetDir,
stdio: "ignore"
});

if (!installResult.error && installResult.status === 0) {
authSpinner.succeed(`Password auth ready ${selectedHash}`);
} else {
if (selectedHash !== "bcryptjs") {
 authSpinner.warn(`${selectedHash} failed, falling back to bcryptjs`);

const fallbackResult = spawnSync("npm",["install" ,"bcryptjs"], {  
    cwd: targetDir,  
    stdio: "ignore",  
  });  

  if (!fallbackResult.error && fallbackResult.status === 0) {
  selectedHash = "bcryptjs";  
  authSpinner.succeed("Password auth ready (bcryptjs fallback)");  
  } else {
  authSpinner.fail("Failed to install password auth");
  process.exit(1);
  }
} else {  
  authSpinner.fail("Failed to install password auth");  
  process.exit(1);  
}
}
}
if (answers.authMode !== "base") {
const hashLib = selectedHash as "argon2" | "bcryptjs";

await fs.writeFile(
path.join(targetDir, "src/utils/hash.ts"),
generateHashModule(hashLib)
);

//const deps = [];

//if (hashLib === "argon2") deps.push("argon2");
//if (hashLib === "bcryptjs") deps.push("bcryptjs");

//if (deps.length) {
//execSync(`npm install ${deps.join(" ")}`, {
//cwd: targetDir,
//stdio: "ignore",
//});
//};
}
saveState("auth-installed", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
currentStep = "auth-installed";
} else {
selectedHash = savedState?.hashLib ?? selectedHash;
console.log(chalk.gray("↷ Skipping auth setup (already completed)"));
}

if (!hasReachedStep(currentStep, "prisma-configured")) {
const pkgPath = path.join(targetDir, "package.json");
const pkg = await fs.readJson(pkgPath);

pkg.dependencies = {
...pkg.dependencies,
ioredis: "^5.8.1",
};

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
await fs.writeJson(pkgPath, pkg, { spaces: 2 });

prismaSpinner.succeed(`Prisma (${dbType}) configured`);

} catch (err) {
prismaSpinner.fail("Failed to setup Prisma");
exitForInterrupt(err);
}

}

await fs.writeJson(pkgPath, pkg, { spaces: 2 });
saveState("prisma-configured", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
currentStep = "prisma-configured";
} else {
console.log(chalk.gray("↷ Skipping Prisma/package setup (already completed)"));
}

if (!hasReachedStep(currentStep, "deps-installed")) {
const installSpinner = ora("Installing dependencies...(this may take a few minutes)").start();

try {
execSync("npm install", {
cwd: targetDir,
stdio: "ignore",
});

installSpinner.succeed("Dependencies installed");

} catch (err) {
installSpinner.fail("Failed to install dependencies");
exitForInterrupt(err);
}
saveState("deps-installed", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
currentStep = "deps-installed";
} else {
console.log(chalk.gray("↷ Skipping dependency install (already completed)"));
}

if (!hasReachedStep(currentStep, "prisma-generated")) {
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
exitForInterrupt(err);
}
}
saveState("prisma-generated", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
currentStep = "prisma-generated";
} else {
console.log(chalk.gray("↷ Skipping Prisma client generation (already completed)"));
}


if (isProduction && !hasReachedStep(currentStep, "production-configured")) {
const pm2Spinner = ora("Setting up production mode (PM2)...").start();

try {
execSync("npm install pm2", {
cwd: targetDir,
stdio: "ignore",
});

pm2Spinner.succeed("PM2 installed (production-ready)");

} catch (err) {
pm2Spinner.fail("Failed to install PM2");
exitForInterrupt(err);
}
saveState("production-configured", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
currentStep = "production-configured";
}


if (!hasReachedStep(currentStep, "git-initialized")) {
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
saveState("git-initialized", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
currentStep = "git-initialized";
} else {
console.log(chalk.gray("↷ Skipping git init (already completed)"));
}

console.log(chalk.green.bold("\n🎉 Authenik8 app created successfully!\n"));

if (isProduction) {
fs.appendFileSync(
path.join(targetDir, "README.md"),

`

🚀 Production Mode

This project is configured for production using PM2.

Start app in cluster mode:

npm run pm2:start

View logs:

npm run pm2:logs

Stop app:

npm run pm2:stop

   `);  
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
✔ ${answers.usePrisma ? (answers.database === "postgresql"  ? "PostgreSQL" : "SQLite") : "No database"}
✔ ${answers.usePrisma ? "Prisma ORM" : "No ORM"}

📡 API Routes:
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
`
}

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
saveState("done", answers.authMode !== "base" ? { hashLib: selectedHash } : {});
clearState();

}catch(err){
console.error("Fatal error",err);
process.exit(1)
}
}
main().catch(async (err) => {
if (err instanceof ExitPromptError) {
console.log("\n👋 Authenik8 setup cancelled.");

await cleanupIncompleteProject();
process.exit(0);
}
console.error(chalk.red("\n❌ Unexpected error:"), err);
 await cleanupIncompleteProject();
 process.exit(1);

})
