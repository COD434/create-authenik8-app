import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { CHILD_LOG_LIST_LIMIT, pruneChildLogs } from "./subagent-log.js";

const USAGE = `Usage: npm run prune:subagents -- [options]

Retention is opt-in and dry-run by default. Only valid child logs under the
sandbox's .authenik8/subagents directory are considered.

Options:
  --keep <n>            Keep the newest n logs (default ${CHILD_LOG_LIST_LIMIT}, max 10000)
  --min-age-hours <n>   Only prune logs at least n hours old (default 1)
  --sandbox <dir>       Sandbox root (default SANDBOX_DIR or ./.studio-sandbox)
  --yes                 Delete eligible logs; without this, report only
  --help                Show this help`;

function parseKeep(raw: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("--keep must be a positive integer");
  }
  return value;
}

function parseMinAgeHours(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("--min-age-hours must be a non-negative number");
  }
  return value;
}

type PruneArgs = {
  keep: string;
  "min-age-hours": string;
  sandbox?: string;
  yes: boolean;
  help: boolean;
};

function parsePruneArgs(argv: string[]): PruneArgs | null {
  try {
    const { values } = parseArgs({
      options: {
        keep: { type: "string", default: String(CHILD_LOG_LIST_LIMIT) },
        "min-age-hours": { type: "string", default: "1" },
        sandbox: { type: "string" },
        yes: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    return values;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return null;
  }
}

type PruneOutcome = Awaited<ReturnType<typeof pruneChildLogs>>;

function reportPruneResult(
  result: PruneOutcome,
  sandboxRoot: string,
  keep: number,
  minAgeHours: number,
): number {
  console.log(`Sandbox: ${sandboxRoot}`);
  if (result.scanned === 0) {
    console.log("No valid child logs found.");
    return 0;
  }

  const selected = result.dryRun ? result.eligible.length : result.pruned.length;
  const action = result.dryRun ? "Would prune" : "Pruned";
  console.log(`${action} ${selected} of ${result.scanned} child logs; keeping the newest ${keep}.`);
  console.log(`Only logs at least ${minAgeHours}h old are eligible.`);
  for (const entry of result.eligible.slice(0, 20)) {
    console.log(`  ${entry.id}  ${entry.bytes} B  ${entry.modifiedAt}`);
  }
  if (result.eligible.length > 20) {
    console.log(`  ... and ${result.eligible.length - 20} more`);
  }

  if (result.dryRun) {
    if (result.eligible.length > 0) console.log("Dry run only. Re-run with --yes to delete.");
    return 0;
  }

  console.log(`Deleted: ${result.pruned.length}. Failed: ${result.failed.length}.`);
  for (const failure of result.failed) {
    console.error(`  ${failure.id}: ${failure.error}`);
  }
  return result.failed.length === 0 ? 0 : 1;
}

export async function main(): Promise<number> {
  const values = parsePruneArgs(process.argv.slice(2));
  if (values === null) return 1;

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  try {
    const keep = parseKeep(values.keep);
    const minAgeHours = parseMinAgeHours(values["min-age-hours"]);
    const sandboxRoot = path.resolve(
      values.sandbox ?? process.env.SANDBOX_DIR ?? path.join(process.cwd(), ".studio-sandbox"),
    );
    const result = await pruneChildLogs(sandboxRoot, {
      keep,
      dryRun: !values.yes,
      minAgeMs: minAgeHours * 3_600_000,
    });
    return reportPruneResult(result, sandboxRoot, keep, minAgeHours);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  void main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
