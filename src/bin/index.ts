#!/usr/bin/env node


import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import { ExitPromptError } from "@inquirer/core";
import ora from "ora";
import { execSync,ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { spawnSync, spawn } from "child_process";
import os from "os";

const spinner = ora().start();
const activeProcesses = new Set<ChildProcess>();

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


type RunOptions = {
  cwd: string;
  stdio:string;
};

export function run(cmd: string, args: string[], options: RunOptions):Promise<void> {
	return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: "ignore",
    });
    activeProcesses.add(child);


  child.on("exit", (code) => {
    activeProcesses.delete(child);

  

  if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });

  child.on("error", (err) => {
    activeProcesses.delete(child);
    reject(err)
  });

})
}

function killAllProcesses() {
  for (const proc of activeProcesses) {
    try {
      proc.kill("SIGINT");
    } catch {}
  }

  activeProcesses.clear();
}


function getCommand(cmd: string) {
  const isWin = process.platform === "win32";

  if (cmd === "npm") return isWin ? "npm.cmd" : "npm";
  if (cmd === "npx") return isWin ? "npx.cmd" : "npx";
  if (cmd === "git") return isWin ? "git.exe" : "git";

  return cmd;
}
//make sure steps are completed
function stepActuallyCompleted(step: StepName): boolean {
  switch (step) {
    case "deps-installed":
      return fs.existsSync(path.join(targetDir, "node_modules"));
    
    case "prisma-generated":
      return fs.existsSync(
        path.join(targetDir, "node_modules/.prisma/client")
      );

    case "git-initialized":
      return fs.existsSync(path.join(targetDir, ".git"));

    default:
      return true;
  }
}


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

const args = process.argv.slice(2);
const projectNameArg = args.find(arg => !arg.startsWith("--"));

//const projectNameArg = process.argv[2];

if (!projectNameArg) {
  console.log(chalk.red("❌ Please provide a project name"));
  process.exit(1);
}
const projectName: string = projectNameArg;

//let answers:any = {};
let state:CliState ={
step:"start",
projectName,
}

const platform = os.platform();
// 'linux' | 'darwin' | 'win32'

const isTermux =
process.env.PREFIX?.includes("com.termux") ||
process.env.TERMUX === "true";


function getBestHashLib() {
if (isTermux) return "bcryptjs";

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
const isProduction = args.includes("--production-ready");
const isResume = args.includes("--resume");


const targetDir = path.resolve(process.cwd(), projectName);


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
const stepLabels: Record<StepName, string> = {
  start: "Starting",
  prompts: "Collecting inputs",
  "project-created": "Project scaffold",
  "auth-installed": "Auth setup",
  "prisma-configured": "Prisma setup",
  "deps-installed": "Dependencies install",
  "prisma-generated": "Prisma generate",
  "production-configured": "Production setup",
  "git-initialized": "Git init",
  done: "Completed",
};
const globalStateDir = path.join(process.cwd(),".authenik8");
const stateFile = path.join(globalStateDir, `${projectName}.json`);

function hasReachedStep(currentStep: StepName, targetStep: StepName) {
return stepOrder.indexOf(currentStep) >= stepOrder.indexOf(targetStep);
}

//function saveState(step: StepName, extra: Partial<CliState> = {}) {
function saveState(update:Partial<CliState>){
state = { ...state, ...update }; 
 

	fs.ensureDirSync(path.dirname(stateFile));
	
fs.writeJsonSync(stateFile, state, { spaces: 2 });
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

function renderStep(current: StepName) {
  console.clear();
  renderHeader()

  for (const step of stepOrder) {
    const label = stepLabels[step];

    if (step === "production-configured" && !isProduction) {
    continue;
  }

    if (step === current) {
      console.log(chalk.yellow(`⏳ ${label}...`));
      break;
    }

    if (hasReachedStep(current, step)) {
      console.log(chalk.green(`✔ ${label}`));
    } else {
      console.log(chalk.gray(`○ ${label}`));
    }
  }

  console.log("");
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

async function exitForInterrupt(err: unknown) {  
if (isInterruptedError(err)) {  
throw err;  
}
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
 
function renderHeader() {
  console.log(chalk.cyan.bold("Happy building \nAuthenik8 CLI"));
  console.log(chalk.gray("────────────────────"));
  console.log("");
} 
async function showBootLogo() {  
console.clear();  
  
 spinner.text ="Initializing Authenik8 engine...";  
  
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
spinner.succeed("Engine ready");  
}  
  
  
  

async function main(){
process.on("SIGINT", async () => {
console.log("\n")
spinner.stop(); 

  killAllProcesses();

  console.log(chalk.yellow("⏸ Setup interrupted."));
  console.log(chalk.gray(`↻ Resume with: create-authenik8-app ${projectName} --resume`));


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
let currentStep:StepName = "start";

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
state = savedState;
currentStep = state.step;

console.log(
chalk.yellow(`\n↻ Resuming setup for ${projectName} from "${currentStep}"...\n`)
);
  
} else{
	const promptAnswers = await inquirer.prompt([
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
//saveState({
//...promptAnswers,
//step:"prompts"});
state = {
    ...state,
    ...promptAnswers,
    step: "prompts"
  };

  saveState({
    ...state
  });
currentStep = "prompts";
}

function assertRequired(value: any, name: string) {
if (value === undefined || value === null || value === "") {
console.log(`❌ Missing required input: ${name}`);
process.exit(1);
}
}

assertRequired(state.framework, "framework");
assertRequired(state.authMode, "authMode");

if (state.usePrisma) {
if (!state.database) {
state.database = "sqlite";
}
assertRequired(state.database, "database");
}

console.log(chalk.cyan("\nSetting up your project\n"));

const templateRoot = path.resolve(__dirname, "../../templates");

let templateName = "express-base";

if (state.authMode === "auth") {
templateName = "express-auth";
}

if (state.authMode === "auth-oauth") {
templateName = "express-auth+";
}

const templatePath = path.join(templateRoot, templateName);

// 📁 Create project (SPINNER)
if (!hasReachedStep(currentStep, "project-created")) {
renderStep("project-created")

try {
await fs.copy(templatePath, targetDir);
projectCreated = true

saveState({step :"project-created"});
currentStep = "project-created";
renderStep(currentStep)
} catch (err) {
	
console.error(err);

process.exit(1);

}
} else {
console.log(chalk.gray("↷ Skipping project creation (already completed)"));
}

let selectedHash = "bcryptjs"; // default safe fallback

if (!hasReachedStep(currentStep, "auth-installed")) {
if (state.authMode !== "base") {
spinner.start("Installing password auth...")

selectedHash = getBestHashLib();
try{
const installResult =  await run(getCommand("npm") ,["install", selectedHash ],{
cwd: targetDir,
stdio: "ignore"
});



}catch{

if (selectedHash !== "bcryptjs") {
 spinner.warn(`${selectedHash} failed, falling back to bcryptjs`);

const fallbackResult = await run(getCommand("npm"),["install" ,"bcryptjs"], {  
    cwd: targetDir,  
    stdio: "ignore",  
  });  
spinner.stop();

  selectedHash = "bcryptjs";  
  renderStep("auth-installed"); 
}else{
  spinner.fail("Failed to install password auth");
  process.exit(1);
   
  spinner.fail("Failed to install password auth");  
  process.exit(1);  
}
}
}
renderStep("auth-installed")
if (state.authMode !== "base") {

spinner.start("Installing password auth...");
const hashLib = selectedHash as "argon2" | "bcryptjs";

await fs.writeFile(
path.join(targetDir, "src/utils/hash.ts"),
generateHashModule(hashLib)
);

}
saveState({step:"auth-installed", ...(state.authMode !== "base" && { hashLib: selectedHash })
});
currentStep = "auth-installed";
renderStep(currentStep);
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

if (state.usePrisma) {
spinner.start("Adding Prisma setup...");

try {  
const dbType = state.database ===

"postgresql" ? "postgresql" :
 "sqlite";

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

spinner.succeed(`Prisma (${dbType}) configured`);

} catch (err) {
spinner.fail("Failed to setup Prisma");
exitForInterrupt(err);
}
}

await fs.writeJson(pkgPath, pkg, { spaces: 2 });

saveState({step:"prisma-configured", ...(state.authMode !== "base" && { hashLib: selectedHash })
});
currentStep = "prisma-configured";
renderStep(currentStep)
} else {
console.log(chalk.gray(" Skipping Prisma/package setup (already completed)"));
}

if(!hasReachedStep(currentStep, "deps-installed")) {
renderStep("deps-installed")
spinner.start("Installing dependencies...(this may take a few minutes)");

try {
await run(getCommand("npm"),["install"], {
cwd: targetDir,
stdio: "ignore",
});

spinner.stop();

} catch (err) {
spinner.fail("Failed to install dependencies");
exitForInterrupt(err);
}
saveState({step:"deps-installed", ...(state.authMode !== "base" && { hashLib: selectedHash })
})
currentStep = "deps-installed";
renderStep(currentStep);
} else {
await run(getCommand("npm"),["install"], {
cwd: targetDir,
stdio: "ignore",
})
}

if (!hasReachedStep(currentStep, "prisma-generated")) {
if (state.usePrisma) {
	spinner.start("Generating Prisma client...");

try {
await run(getCommand("npx"), ["prisma@5.22.0", "generate"], {
cwd: targetDir,
stdio: "ignore"
});

spinner.stop();

} catch (err) {
spinner.fail("Failed to generate Prisma client");
exitForInterrupt(err);
}
}
saveState({step:"prisma-generated", ...(state.authMode !== "base" && { hashLib: selectedHash })
})
currentStep = "prisma-generated";
renderStep(currentStep)
} else {
console.log(chalk.gray("↷ Skipping Prisma client generation (already completed)"));
}


if (isProduction && !hasReachedStep(currentStep, "production-configured")) {
spinner.start("Setting up production mode (PM2)...");

try {
 await run(getCommand("npm"),["install pm2"], {
cwd: targetDir,
stdio: "ignore",
});

spinner.stop();
} catch (err) {
spinner.fail("Failed to install PM2");
exitForInterrupt(err);
}
saveState({step:"production-configured", ...(state.authMode !== "base" && { hashLib: selectedHash })
})
currentStep = "production-configured";
renderStep(currentStep)
}


if (!hasReachedStep(currentStep, "git-initialized")) {
if (state.useGit) {
renderStep("git-initialized");

try {  
   await run(getCommand("git"), ["init"], {  
    cwd: targetDir,  
    stdio: "ignore",  
  });  
  spinner.stop();
} catch (err) {  
  spinner.fail("Git init failed");  
}

}
saveState({step:"git-initialized",...(state.authMode !== "base" && { hashLib: selectedHash }),
})
currentStep = "git-initialized";
renderStep("done")
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
state.authMode === "base"
? "✓ JWT only"
: state.authMode === "auth"
? "✓ Email + Password"
: "✓ Password + OAuth (Google/GitHub)"
}

🛠 Stack:
✔ Express
✔ ${state.usePrisma ? (state.database === "postgresql"  ? "PostgreSQL" : "SQLite") : "No database"}
✔ ${state.usePrisma ? "Prisma ORM" : "No ORM"}

📡 API Routes:
${
  state.authMode === "base"
    ? `
  GET    /public
  GET    /guest
  GET    /protected
  POST   /refresh
`
    : state.authMode === "auth"
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
saveState({step:"done", ...(state.authMode !== "base" && { hashLib: selectedHash }),
})
clearState();

}catch(err){
	if (err instanceof ExitPromptError) {
    throw err;

console.error("Fatal error",err);
process.exit(1)
}
}
}
main().catch(async (err) => {
if (err instanceof ExitPromptError) {
console.log("\n👋 Authenik8 setup cancelled.You can --resume later");

killAllProcesses()
await new Promise((r) => setTimeout(r, 300));

console.log(chalk.bgYellow.black(" SETUP CANCELLED "));

   
await cleanupIncompleteProject();
process.exit(0);
}
console.error(chalk.red("\n❌ Unexpected error:"),err);
 await cleanupIncompleteProject();
 process.exit(1);

})
