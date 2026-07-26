import type { AuthMode } from "../../lib/types.js";
import type { OAuthProvider } from "../../lib/oauth.js";
import type { ProjectManifest } from "../../lib/projectManifest.js";

export type AddRecipeId = `oauth-${OAuthProvider}` | "ci-github";

export type PlannedFileChange = {
  relativePath: string;
  before: string | null;
  after: string;
  sensitive?: boolean;
};

export type AddContext = {
  rootDir: string;
  manifest: ProjectManifest;
};

export type AddRecipe = {
  id: AddRecipeId;
  aliases: readonly string[];
  description: string;
  provider?: OAuthProvider;
  category: "oauth" | "ci";
  supportedPresets: readonly AuthMode[];
  plan(context: AddContext): Promise<PlannedFileChange[]>;
};

export type AddOptions = {
  recipeName?: string;
  directory: string;
  dryRun: boolean;
  list: boolean;
  help: boolean;
};

export type AddResult = {
  recipe: AddRecipe;
  rootDir: string;
  changes: PlannedFileChange[];
  status: "applied" | "preview" | "unchanged";
};
