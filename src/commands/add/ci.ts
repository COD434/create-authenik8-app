import path from "node:path";
import fs from "fs-extra";

import { currentToolRelease } from "../../lib/release.js";
import type { PackageManager } from "../../lib/types.js";
import { AddRecipeError } from "./plan.js";
import type { AddContext, PlannedFileChange } from "./types.js";

export const githubCiWorkflowPath = ".github/workflows/authenik8.yml";
const workflowSchemaVersion = 1;
const pnpmVersion = "10.12.1";
const bunVersion = "1.3.14";

function packageManagerSetup(packageManager: PackageManager): string[] {
  if (packageManager === "pnpm") {
    return [
      "      - name: Install pinned pnpm",
      `        run: npm install --global pnpm@${pnpmVersion}`,
      "",
    ];
  }
  if (packageManager === "bun") {
    return [
      "      - name: Install pinned Bun",
      `        run: npm install --global bun@${bunVersion}`,
      "",
    ];
  }
  return [];
}

function installCommand(packageManager: PackageManager): string {
  if (packageManager === "pnpm") return "pnpm install --frozen-lockfile";
  if (packageManager === "bun") return "bun install --frozen-lockfile";
  return "npm ci --no-audit --no-fund";
}

export function renderGithubCiWorkflow(
  packageManager: PackageManager,
  cliVersion: string,
): string {
  return [
    "# Managed by create-authenik8-app. Re-run `create-authenik8-app add ci-github` to update safely.",
    `# authenik8-ci-schema: ${workflowSchemaVersion}`,
    `# authenik8-cli: ${cliVersion}`,
    "name: Authenik8 security boundary",
    "",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches: [main, master]",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  auth-boundary:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 10",
    "    steps:",
    "      - name: Check out repository",
    "        uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
    "        with:",
    "          persist-credentials: false",
    "",
    "      - name: Set up Node.js",
    "        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    "        with:",
    "          node-version: 22.12.x",
    "",
    ...packageManagerSetup(packageManager),
    "      - name: Install locked dependencies",
    `        run: ${installCommand(packageManager)}`,
    "",
    "      - name: Validate the Authenik8 boundary",
    `        run: npx --yes create-authenik8-app@${cliVersion} doctor --json --skip-services`,
    "",
    "      - name: Enforce the Authenik8 upgrade policy",
    `        run: npx --yes create-authenik8-app@${cliVersion} upgrade --check --json`,
    "",
  ].join("\n");
}

async function requireLockfile(context: AddContext): Promise<void> {
  const candidates: Record<PackageManager, string[]> = {
    npm: ["package-lock.json"],
    pnpm: ["pnpm-lock.yaml"],
    bun: ["bun.lock", "bun.lockb"],
  };
  const found = await Promise.all(candidates[context.manifest.packageManager].map((filename) =>
    fs.pathExists(path.join(context.rootDir, filename))
  ));
  if (!found.some(Boolean)) {
    throw new AddRecipeError(
      `ci-github requires a committed ${context.manifest.packageManager} lockfile so CI cannot resolve an unaudited dependency graph. Run the project's package manager install first.`,
    );
  }
}

export async function planGithubCi(context: AddContext): Promise<PlannedFileChange[]> {
  await requireLockfile(context);
  const cliVersion = currentToolRelease().generatorVersion;
  const filename = path.join(context.rootDir, githubCiWorkflowPath);
  const before = await fs.pathExists(filename) ? await fs.readFile(filename, "utf8") : null;
  const after = renderGithubCiWorkflow(context.manifest.packageManager, cliVersion);
  if (before === after) return [];

  if (before !== null) {
    const schema = before.match(/^# authenik8-ci-schema: (\d+)$/m)?.[1];
    const previousVersion = before.match(/^# authenik8-cli: (\S+)$/m)?.[1];
    if (schema !== String(workflowSchemaVersion) || !previousVersion) {
      throw new AddRecipeError(
        `${githubCiWorkflowPath} already exists and is not a recognized managed workflow; refusing to overwrite it.`,
      );
    }
    const expected = renderGithubCiWorkflow(context.manifest.packageManager, previousVersion);
    if (before !== expected) {
      throw new AddRecipeError(
        `${githubCiWorkflowPath} has local changes; refusing to overwrite the customized security workflow.`,
      );
    }
  }
  return [{ relativePath: githubCiWorkflowPath, before, after }];
}
