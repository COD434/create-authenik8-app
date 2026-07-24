import type { AddResult } from "./types.js";
import { addRecipes } from "./registry.js";
import { formatAddDiff } from "./diff.js";

export function addHelp(): string {
  return `
AUTHENIK8 ADD
Apply a built-in, auditable auth recipe to a generated project

Usage:
  create-authenik8-app add <recipe> [directory] [options]
  create-authenik8-app add --list

Options:
  --dry-run, --diff   Print the exact proposed diff without writing files
  --list              List built-in recipes and compatible presets
  -h, --help          Show this help message

Examples:
  npx create-authenik8-app add oauth-github
  npx create-authenik8-app add oauth-google ./my-app --dry-run
`;
}

export function formatRecipeList(): string {
  const lines = ["\nBuilt-in Authenik8 recipes", ""];
  for (const recipe of addRecipes) {
    lines.push(
      `  ${recipe.id.padEnd(16)} ${recipe.description}`,
      `  ${"".padEnd(16)} Presets: ${recipe.supportedPresets.join(", ")}`,
    );
  }
  lines.push("", "Preview any recipe with --dry-run before applying it.", "");
  return lines.join("\n");
}

export function formatAddResult(result: AddResult): string {
  const lines = [
    "",
    `Authenik8 add · ${result.recipe.id}`,
    `Project: ${result.rootDir}`,
    "",
  ];

  if (result.status === "unchanged") {
    lines.push("Nothing to change. The recipe is already fully wired.", "");
    return lines.join("\n");
  }

  lines.push(formatAddDiff(result.changes), "");
  if (result.status === "preview") {
    lines.push(`Dry run: ${result.changes.length} file(s) would change; no files were written.`);
  } else {
    lines.push(`Applied and verified ${result.changes.length} file(s).`);
    if (result.recipe.provider) {
      const prefix = result.recipe.provider.toUpperCase();
      lines.push(
        `Next: set ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET, then run create-authenik8-app doctor.`,
      );
    } else {
      lines.push("Next: commit the workflow and let its Authenik8 checks run on a pull request.");
    }
  }
  lines.push("");
  return lines.join("\n");
}
