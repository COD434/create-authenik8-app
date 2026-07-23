import type { StdioOptions } from "child_process";
import type { z } from "zod";
import type {
<<<<<<< HEAD
  authModeSchema,
  databaseSchema,
  cliStateSchema,
  oauthProviderSchema,
  packageManagerSchema,
  runtimeSchema,
=======
  cliStateSchema,
  packageManagerSchema,
>>>>>>> main
  stepNameSchema,
} from "./schemas.js";

export type PackageManager = z.infer<typeof packageManagerSchema>;
<<<<<<< HEAD
export type AuthMode = z.infer<typeof authModeSchema>;
export type Database = z.infer<typeof databaseSchema>;
export type OAuthProviderName = z.infer<typeof oauthProviderSchema>;
export type Runtime = z.infer<typeof runtimeSchema>;
=======
>>>>>>> main
export type StepName = z.infer<typeof stepNameSchema>;
export type CliState = z.infer<typeof cliStateSchema>;

export type RunOptions = {
  cwd: string;
  stdio?: StdioOptions;
  env?: NodeJS.ProcessEnv;
};
