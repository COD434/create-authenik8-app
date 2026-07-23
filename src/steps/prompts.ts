import inquirer from "inquirer";
import type { CliState } from "../lib/types.js";
import {
<<<<<<< HEAD
=======
  authMethodSelectionSchema,
>>>>>>> main
  firstZodIssue,
  oauthProviderSelectionSchema,
  promptAnswersSchema,
} from "../lib/schemas.js";
import { hasBun } from "./finalSetup.js";

function validateSelection(
<<<<<<< HEAD
  schema: typeof oauthProviderSelectionSchema,
=======
  schema: typeof authMethodSelectionSchema | typeof oauthProviderSelectionSchema,
>>>>>>> main
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
<<<<<<< HEAD
        {
          name: "Fullstack app (recommended) · React + Express, embedded PostgreSQL, npm",
          value: "fullstack",
        },
        {
          name: "JWT-only API · bring your own identity source, optional Prisma, Redis",
          value: "base",
        },
        {
          name: "Password API · email/password, Prisma, SQLite or PostgreSQL, Redis",
          value: "auth",
        },
        {
          name: "OAuth API · password + Google/GitHub, Prisma, database, Redis",
          value: "auth-oauth",
        },
=======
        { name: "Full-stack application (recommended)", value: "fullstack" },
        { name: "Express API (JWT only)", value: "base" },
        { name: "Express API + email/password", value: "auth" },
        { name: "Express API + OAuth", value: "auth-oauth" },
>>>>>>> main
      ],
      default: "fullstack",
    },
    {
      type: "checkbox",
<<<<<<< HEAD
      name: "fullstackOAuthProviders",
      message: "Add OAuth providers now? (optional; password auth is included)",
      choices: [
        { name: "Google (requires provider credentials)", value: "google" },
        { name: "GitHub (requires provider credentials)", value: "github" },
      ],
      when: (answers) => answers.authMode === "fullstack",
=======
      name: "authMethods",
      message: "Select authentication methods:",
      choices: [
        { name: "Email and password (required)", value: "password", checked: true },
        { name: "Google", value: "google", checked: true },
        { name: "GitHub", value: "github", checked: true },
      ],
      when: (answers) => answers.authMode === "fullstack",
      validate: (choices) => validateSelection(authMethodSelectionSchema, choices),
>>>>>>> main
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
<<<<<<< HEAD
      const { fullstackOAuthProviders, ...promptResult } = result;
      const answers = {
        ...promptResult,
        framework: "Express" as const,
        ...(promptResult.authMode === "fullstack"
          ? {
            authMethods: [
              "password" as const,
              ...((fullstackOAuthProviders ?? []) as Array<"google" | "github">),
            ],
          }
          : {}),
        ...(promptResult.runtime === "bun" && !bunAvailable ? { runtime: "node" as const } : {}),
=======
      const answers = {
        ...result,
        framework: "Express" as const,
        ...(result.runtime === "bun" && !bunAvailable ? { runtime: "node" as const } : {}),
>>>>>>> main
      };
      const validation = promptAnswersSchema.safeParse(answers);
      if (!validation.success) {
        throw new Error(`Invalid prompt input: ${firstZodIssue(validation.error)}`);
      }
      return validation.data;
    });
}
