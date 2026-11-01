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
  let resourceName: string | undefined;
  let fields: string | undefined;
  let withTests = false;
  let withCrudUi = false;

  let index = 0;
  while (index < args.length) {
    const argument = args[index]!;
    if (argument === "--dry-run" || argument === "--diff") {
      dryRun = true;
      index += 1;
    } else if (argument === "--list") {
      list = true;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
      index += 1;
    } else if (argument === "--name" || argument === "--fields") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new AddUsageError(`${argument} requires a value.`);
      }
      if (argument === "--name") resourceName = value;
      else fields = value;
      index += 2;
    } else if (argument === "--with-tests") {
      withTests = true;
      index += 1;
    } else if (argument === "--with-crud-ui") {
      withCrudUi = true;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new AddUsageError(`Unknown add option: ${argument}`);
    } else {
      positional.push(argument);
      index += 1;
    }
  }

  if (!list && !help && !positional[0]) {
    throw new AddUsageError("Add requires a recipe name. Use --list to see available recipes.");
  }

  const recipe = positional[0] ? findAddRecipe(positional[0]) : undefined;
  if (
    recipe
    && recipe.category !== "resource"
    && (resourceName !== undefined || fields !== undefined || withTests || withCrudUi)
  ) {
    throw new AddUsageError("--name, --fields, --with-tests, and --with-crud-ui only apply to the resource recipe.");
  }

  if (recipe?.category === "resource") {
    const extras = positional.slice(1);
    if (resourceName !== undefined) {
      if (extras.length > 1) {
        throw new AddUsageError("Add accepts at most one project directory.");
      }
      return {
        recipeName: recipe.id,
        resourceName,
        ...(fields !== undefined ? { fields } : {}),
        withTests,
        withCrudUi,
        directory: path.resolve(cwd, extras[0] ?? "."),
        dryRun,
        list,
        help,
      };
    }
    const [nameArg, directoryArg, extra] = extras;
    if (extra) {
      throw new AddUsageError("Add accepts one resource name and one project directory.");
    }
    if (!nameArg) {
      throw new AddUsageError(
        'Resource recipes need a PascalCase resource name: add resource Invoice --fields "amount:number".',
      );
    }
    return {
      recipeName: recipe.id,
      resourceName: nameArg,
      ...(fields !== undefined ? { fields } : {}),
      withTests,
      withCrudUi,
      directory: path.resolve(cwd, directoryArg ?? "."),
      dryRun,
      list,
      help,
    };
  }

  if (positional.length > 2) {
    throw new AddUsageError("Add accepts one recipe and at most one project directory.");
  }

  return {
    ...(positional[0] ? { recipeName: positional[0] } : {}),
    ...(resourceName !== undefined ? { resourceName } : {}),
    ...(fields !== undefined ? { fields } : {}),
    ...(withTests ? { withTests } : {}),
    ...(withCrudUi ? { withCrudUi } : {}),
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
  const request = recipe.category === "resource"
    ? {
        name: options.resourceName ?? "",
        fields: options.fields ?? "",
        withTests: Boolean(options.withTests),
        withCrudUi: Boolean(options.withCrudUi),
      }
    : undefined;
  const changes = await recipe.plan(context, request);
  if (changes.length === 0) {
    return { recipe, rootDir: context.rootDir, changes, status: "unchanged" };
  }
  if (options.dryRun) {
    return { recipe, rootDir: context.rootDir, changes, status: "preview" };
  }

  await applyPlannedChanges(context.rootDir, changes, async () => {
    const verified = await recipe.plan(await createAddContext(context.rootDir), request);
    if (verified.length > 0) {
      throw new Error(
        `Post-apply verification found ${verified.length} unapplied recipe change(s).`,
      );
    }
  });
  return { recipe, rootDir: context.rootDir, changes, status: "applied" };
}
