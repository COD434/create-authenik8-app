import type { StepName } from "./types.js";

export const PRISMA_VERSION = "7.8.0";

export const stepOrder: StepName[] = [
  "start",
  "prompts",
  "project-created",
  "auth-installed",
  "prisma-configured",
  "production-configured",
  "deps-installed",
  "git-initialized",
  "project-validated",
  "done",
];

export const stepLabels: Record<StepName, string> = {
  start: "Start setup",
  prompts: "Collect configuration",
  "project-created": "Create project files",
  "auth-installed": "Configure authentication",
  "prisma-configured": "Configure database",
  "deps-installed": "Install dependencies",
  "production-configured": "Configure production runtime",
  "git-initialized": "Initialize Git repository",
<<<<<<< HEAD
  "project-validated": "Validate generated auth boundary",
=======
>>>>>>> main
  done: "Project ready",
};
