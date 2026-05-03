export type StepName =
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
};

export type RunOptions = {
  cwd: string;
  stdio: string;
};
