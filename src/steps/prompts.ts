import inquirer from "inquirer";
import type { CliState } from "../lib/types.js";
import {hasBun} from "./finalSetup.js"

export async function runPrompts(state:CliState,isProduction: boolean): Promise<Partial<CliState>> {
const bunAvailable = hasBun();	
  return inquirer.prompt([
    {
      type: "list",
      name: "framework",
      message: "Choose framework:",
      choices: ["Express", "Fastify (coming soon)"],
      default: "Express",
    }, 
    {
      type: "list",
      name: "authMode",
      message: "Choose authentication setup:",
      choices: [
        { name: "JWT only", value: "base" },
        { name: "Email + Password Auth", value: "auth" },
        { name: "Full Auth (Password + OAuth)", value: "auth-oauth" },
      ],
      default: "base",
    },
    {
      type: "confirm",
      name: "usePrisma",
      message: "Use Prisma?",
      default: true,
     when: (answers) => answers.authMode === "base"
    },
    {
      type: "list",
      name: "database",
      message: "Choose database:",
      choices: [
        { name: "PostgreSQL", value: "postgresql" },
        { name: "SQLite ", value: "sqlite" },
      ],
      when: (answers) => answers.usePrisma || answers.authMode === "auth" || answers.authMode === "auth-oauth",
      default: "sqlite",
    },
    {
      type: "confirm",
      name: "useGit",
      message: "Initialize git?",
      default: true,
    },
   
       {
      type: "list",
      name: "runtime",
      message: "Choose runtime:",
      choices: [
        {
          name: bunAvailable
            ? "Bun (fast, no build step)"
            : "Bun (not installed)",
          value: "bun",
          disabled: !bunAvailable && "Bun not found",
        },
        {
          name: "Node (stable, widely supported)",
          value: "node",
        },
      ],
      when: () => isProduction,
      default: bunAvailable ? "bun" : "node"
    },
  ])
  .then((result) => {
    if (result.runtime === "bun" && !bunAvailable) {
      result.runtime = "node";
    }
    return result;
  })  
  
}
