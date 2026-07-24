import path from "node:path";

import { applyPlannedChanges } from "./apply.js";
import { createAddContext } from "./context.js";
import { findAddRecipe } from "./registry.js";
import type { AddOptions, AddResult } from "./types.js";

export class AddUsageError extends Error {}

export function parseAddArguments(
  args: readonly string[],
  cwd = process.cwd(),
): AddOptions {
  const positional: string[] = [];
  let dryRun = false;
  let list = false;
  let help = false;

  for (const argument of args) {
    if (argument === "--dry-run" || argument === "--diff") dryRun = true;
    else if (argument === "--list") list = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument.startsWith("-")) throw new AddUsageError(`Unknown add option: ${argument}`);
    else positional.push(argument);
  }

  if (positional.length > 2) {
    throw new AddUsageError("Add accepts one recipe and at most one project directory.");
  }
  if (!list && !help && !positional[0]) {
    throw new AddUsageError("Add requires a recipe name. Use --list to see available recipes.");
  }

  return {
    ...(positional[0] ? { recipeName: positional[0] } : {}),
    directory: path.resolve(cwd, positional[1] ?? "."),
    dryRun,
    list,
    help,
  };
}

export async function runAdd(options: AddOptions): Promise<AddResult> {
  if (!options.recipeName) throw new AddUsageError("Add requires a recipe name.");
  const recipe = findAddRecipe(options.recipeName);
  if (!recipe) {
    throw new AddUsageError(
      `Unknown recipe "${options.recipeName}". Use create-authenik8-app add --list.`,
    );
  }

  const context = await createAddContext(options.directory);
  const changes = await recipe.plan(context);
  if (changes.length === 0) {
    return { recipe, rootDir: context.rootDir, changes, status: "unchanged" };
  }
  if (options.dryRun) {
    return { recipe, rootDir: context.rootDir, changes, status: "preview" };
  }

  await applyPlannedChanges(context.rootDir, changes, async () => {
    const verified = await recipe.plan(await createAddContext(context.rootDir));
    if (verified.length > 0) {
      throw new Error(
        `Post-apply verification found ${verified.length} unapplied recipe change(s).`,
      );
    }
  });
  return { recipe, rootDir: context.rootDir, changes, status: "applied" };
}
