import type { StdioOptions } from "child_process";

export type StepName =
  | "start"
  | "prompts"
  | "project-created"
  | "auth-installed"
  | "prisma-configured"
  | "production-configured"
  | "deps-installed"
  | "prisma-generated"
  | "git-initialized"
  | "done";

export type CliState = {
  step: StepName;
  runtime?:"node"|"bun";
  projectName: string;
  framework?: string;
  usePrisma?: boolean;
  database?: string;
  useGit?: boolean;
  authMode?: string;
  hashLib?: string;
  oauthProviders?: string[];
};

export type RunOptions = {
  cwd: string;
  stdio?: StdioOptions;
};
