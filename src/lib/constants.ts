import type { StepName } from "./types.js";

export const stepOrder: StepName[] = [
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

export const stepLabels: Record<StepName, string> = {
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
