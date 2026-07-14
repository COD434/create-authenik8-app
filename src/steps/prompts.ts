import inquirer from "inquirer";
import type { CliState } from "../lib/types.js";
import {
  authMethodSelectionSchema,
  firstZodIssue,
  oauthProviderSelectionSchema,
  promptAnswersSchema,
} from "../lib/schemas.js";
import { hasBun } from "./finalSetup.js";

function validateSelection(
  schema: typeof authMethodSelectionSchema | typeof oauthProviderSelectionSchema,
  choices: unknown,
): true | string {
  const result = schema.safeParse(choices);
  return result.success ? true : firstZodIssue(result.error);
}

export async function runPrompts(
  _state: CliState,
  isProduction: boolean,
): Promise<Partial<CliState>> {
  const bunAvailable = isProduction && hasBun();
  return inquirer.prompt([
    {
      type: "list",
      name: "authMode",
      message: "Select a preset:",
      choices: [
        { name: "Full-stack application (recommended)", value: "fullstack" },
        { name: "Express API (JWT only)", value: "base" },
        { name: "Express API + email/password", value: "auth" },
        { name: "Express API + OAuth", value: "auth-oauth" },
      ],
      default: "fullstack",
    },
    {
      type: "checkbox",
      name: "authMethods",
      message: "Select authentication methods:",
      choices: [
        { name: "Email and password (required)", value: "password", checked: true },
        { name: "Google", value: "google", checked: true },
        { name: "GitHub", value: "github", checked: true },
      ],
      when: (answers) => answers.authMode === "fullstack",
      validate: (choices) => validateSelection(authMethodSelectionSchema, choices),
    },
    {
      type: "checkbox",
      name: "oauthProviders",
      message: "Select OAuth providers:",
      choices: [
        { name: "Google", value: "google" },
        { name: "GitHub", value: "github" },
      ],
      when: (answers) => answers.authMode === "auth-oauth",
      validate: (choices) => validateSelection(oauthProviderSelectionSchema, choices),
    },
    {
      type: "confirm",
      name: "usePrisma",
      message: "Add Prisma?",
      default: true,
      when: (answers) => answers.authMode === "base",
    },
    {
      type: "list",
      name: "database",
      message: "Select a database:",
      choices: [
        { name: "SQLite", value: "sqlite" },
        { name: "PostgreSQL", value: "postgresql" },
      ],
      when: (answers) => answers.authMode !== "fullstack"
        && (answers.usePrisma || ["auth", "auth-oauth"].includes(answers.authMode)),
      default: "sqlite",
    },
    {
      type: "confirm",
      name: "useGit",
      message: "Initialize a Git repository?",
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
      when: (answers) => isProduction && answers.authMode !== "fullstack",
      default: bunAvailable ? "bun" : "node",
    },
  ])
    .then((result) => {
      const answers = {
        ...result,
        framework: "Express" as const,
        ...(result.runtime === "bun" && !bunAvailable ? { runtime: "node" as const } : {}),
      };
      const validation = promptAnswersSchema.safeParse(answers);
      if (!validation.success) {
        throw new Error(`Invalid prompt input: ${firstZodIssue(validation.error)}`);
      }
      return validation.data;
    });
}
