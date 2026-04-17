import inquirer from "inquirer";
import type { CliState } from "../lib/types.js";

export async function runPrompts(state: CliState): Promise<Partial<CliState>> {
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
  ]);
}
