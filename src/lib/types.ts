import type { StdioOptions } from "child_process";
import type { z } from "zod";
import type {
  cliStateSchema,
  packageManagerSchema,
  stepNameSchema,
} from "./schemas.js";

export type PackageManager = z.infer<typeof packageManagerSchema>;
export type StepName = z.infer<typeof stepNameSchema>;
export type CliState = z.infer<typeof cliStateSchema>;

export type RunOptions = {
  cwd: string;
  stdio?: StdioOptions;
  env?: NodeJS.ProcessEnv;
};
