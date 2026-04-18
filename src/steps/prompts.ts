import inquirer from "inquirer";
import type { CliState } from "../lib/types.js";
import {hasBun} from "./finalSetup.js"

export async function runPrompts(state:CliState): Promise<Partial<CliState>> {
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
      type: "confirm",
      name: "usePrisma",
      message: "Use Prisma?",
      default: true,
    },
    {
      type: "list",
      name: "database",
      message: "Choose database:",
      choices: [
        { name: "PostgreSQL", value: "postgresql" },
        { name: "SQLite ", value: "sqlite" },
      ],
      when: (answers) => answers.usePrisma,
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
      when: () => true,
      default: bunAvailable ? "bun" : "node"
    },
  ])
  .then((result) => {
    if (result.runtime === "bun" && !bunAvailable) {
      result.runtime = "node";
    }
    return result;
    console.log("Runtime:", result.runtime);
  })  
  
}
