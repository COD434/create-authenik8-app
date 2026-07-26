import path from "node:path";

import { createUpgradeContext } from "./context.js";
import { createUpgradePlan } from "./plan.js";
import type { UpgradeOptions, UpgradePlan } from "./types.js";

export class UpgradeUsageError extends Error {}

export function parseUpgradeArguments(
  args: readonly string[],
  cwd = process.cwd(),
): UpgradeOptions {
  let directory: string | undefined;
  let json = false;
  let check = false;
  let help = false;

  for (const argument of args) {
    if (argument === "--json") json = true;
    else if (argument === "--check") check = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument.startsWith("-")) {
      throw new UpgradeUsageError(`Unknown upgrade option: ${argument}`);
    } else if (directory) {
      throw new UpgradeUsageError("Upgrade accepts at most one project directory.");
    } else directory = argument;
  }
  return { directory: path.resolve(cwd, directory ?? "."), json, check, help };
}

export async function runUpgrade(options: UpgradeOptions): Promise<UpgradePlan> {
  return createUpgradePlan(await createUpgradeContext(options.directory));
}

export function upgradeCheckExitCode(plan: UpgradePlan): 0 | 1 {
  return plan.status === "current" ? 0 : 1;
}
