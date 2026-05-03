import chalk from "chalk";
import ora from "ora";
import type { StepName } from "./types.js";
import { stepLabels, stepOrder } from "./constants.js";
import { hasReachedStep } from "./state.js";

export const spinner = ora().start();

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

`,
];

export function renderHeader() {
  console.log(chalk.cyan.bold("Happy building \nAuthenik8 CLI"));
  console.log(chalk.gray("────────────────────"));
  console.log("");
}

export function renderStep(current: StepName, isProduction: boolean) {
  console.clear();
  renderHeader();

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

export async function showBootLogo() {
  console.clear();
  spinner.text = "Initializing Authenik8 engine...";

  console.clear();
  console.log(chalk.cyan(cleanLogo));
  await sleep(200);

  for (let i = 0; i < 5; i++) {
    console.clear();
    const frame = glitchFrames[Math.floor(Math.random() * glitchFrames.length)];
    console.log(chalk.cyan(frame));
    await sleep(120 + Math.random() * 120);
  }

  for (let i = 0; i < 2; i++) {
    console.clear();
    console.log(chalk.cyan(cleanLogo));
    await sleep(180);
    console.clear();
    console.log(chalk.gray(cleanLogo));
    await sleep(120);
  }

  console.clear();
  console.log(chalk.cyan.bold(cleanLogo));
  await sleep(800);
  spinner.succeed("Engine ready");
}
