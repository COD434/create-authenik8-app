import type { AddRecipe } from "./types.js";
import { planOAuthProvider } from "./plan.js";
import { planGithubCi } from "./ci.js";
import { parseResourceFields, planResource } from "./resource.js";

const googleRecipe = Object.freeze({
    id: "oauth-google",
    aliases: Object.freeze(["google"]),
    description: "Enable Google OAuth across the generated provider registry and environment",
    provider: "google",
    category: "oauth",
    supportedPresets: Object.freeze(["auth-oauth", "fullstack"]),
    plan: (context) => planOAuthProvider(context, "google"),
  } satisfies AddRecipe);

const githubRecipe = Object.freeze({
    id: "oauth-github",
    aliases: Object.freeze(["github"]),
    description: "Enable GitHub OAuth across the generated provider registry and environment",
    provider: "github",
    category: "oauth",
    supportedPresets: Object.freeze(["auth-oauth", "fullstack"]),
    plan: (context) => planOAuthProvider(context, "github"),
  } satisfies AddRecipe);

const githubCiRecipe = Object.freeze({
  id: "ci-github",
  aliases: Object.freeze(["github-ci"]),
  description: "Add a pinned GitHub Actions auth-boundary and upgrade-policy gate",
  category: "ci",
  supportedPresets: Object.freeze(["base", "auth", "auth-oauth", "fullstack"]),
  plan: planGithubCi,
} satisfies AddRecipe);

export const addRecipes: readonly AddRecipe[] = Object.freeze([
  googleRecipe,
  githubRecipe,
  githubCiRecipe,
  Object.freeze({
    id: "resource",
    aliases: Object.freeze(["resource"]),
    description: "Scaffold a CRUD API resource (Prisma model, contracts, module, OpenAPI, client)",
    category: "resource",
    supportedPresets: Object.freeze(["fullstack"]),
    plan: (context, request) =>
      planResource(context, {
        name: request?.name ?? "",
        fields: parseResourceFields(request?.fields ?? ""),
        withTests: Boolean(request?.withTests),
        withCrudUi: Boolean(request?.withCrudUi),
      }),
  } satisfies AddRecipe),
]);

export function findAddRecipe(name: string): AddRecipe | undefined {
  return addRecipes.find((recipe) => recipe.id === name || recipe.aliases.includes(name));
}
