#!/usr/bin/env node
import { doctorHelp, formatDoctorReport } from "../commands/doctor/output.js";
import {
  DoctorUsageError,
  parseDoctorArguments,
  runDoctor,
} from "../commands/doctor/index.js";
import { DoctorProjectError } from "../commands/doctor/context.js";
import { addHelp, formatAddResult, formatRecipeList } from "../commands/add/output.js";
import { AddUsageError, parseAddArguments, runAdd } from "../commands/add/index.js";
import { AddProjectError } from "../commands/add/context.js";
import { AddRecipeError } from "../commands/add/plan.js";
import { formatUpgradePlan, upgradeHelp } from "../commands/upgrade/output.js";
import {
  parseUpgradeArguments,
  runUpgrade,
  upgradeCheckExitCode,
  UpgradeUsageError,
} from "../commands/upgrade/index.js";
import { UpgradeProjectError } from "../commands/upgrade/context.js";
import { resolveRootCommand } from "../lib/rootCommand.js";

function write(stream: NodeJS.WriteStream, value: string): void {
  stream.write(value.endsWith("\n") ? value : `${value}\n`);
}

async function main(): Promise<void> {
  const route = resolveRootCommand(process.argv.slice(2));

  if (route.name === "create") {
    process.argv = [process.argv[0] ?? "node", process.argv[1] ?? "create-authenik8-app", ...route.args];
    await import("./index.js");
    return;
  }

  if (route.name === "add") {
    try {
      const options = parseAddArguments(route.args);
      if (options.help) write(process.stdout, addHelp());
      else if (options.list) write(process.stdout, formatRecipeList());
      else write(process.stdout, formatAddResult(await runAdd(options)));
    } catch (error) {
      if (error instanceof AddUsageError) {
        write(process.stderr, `Error: ${error.message}\n${addHelp()}`);
        process.exitCode = 2;
      } else if (error instanceof AddProjectError || error instanceof AddRecipeError) {
        write(process.stderr, `Error: ${error.message}`);
        process.exitCode = 1;
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        write(process.stderr, `Error: Recipe could not complete: ${detail}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  if (route.name === "upgrade") {
    try {
      const options = parseUpgradeArguments(route.args);
      if (options.help) write(process.stdout, upgradeHelp());
      else {
        const plan = await runUpgrade(options);
        write(process.stdout, formatUpgradePlan(plan, options.json));
        if (options.check) process.exitCode = upgradeCheckExitCode(plan);
      }
    } catch (error) {
      if (error instanceof UpgradeUsageError) {
        write(process.stderr, `Error: ${error.message}\n${upgradeHelp()}`);
        process.exitCode = 2;
      } else if (error instanceof UpgradeProjectError) {
        write(process.stderr, `Error: ${error.message}`);
        process.exitCode = 1;
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        write(process.stderr, `Error: Upgrade plan could not complete: ${detail}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  try {
    const options = parseDoctorArguments(route.args);
    if (options.help) {
      write(process.stdout, doctorHelp());
    } else {
      const report = await runDoctor(options);
      write(process.stdout, formatDoctorReport(report, options.json));
      if (report.summary.failed > 0) process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof DoctorUsageError) {
      write(process.stderr, `Error: ${error.message}\n${doctorHelp()}`);
      process.exitCode = 2;
    } else if (error instanceof DoctorProjectError) {
      write(process.stderr, `Error: ${error.message}`);
      process.exitCode = 1;
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      write(process.stderr, `Error: Doctor could not complete: ${detail}`);
      process.exitCode = 1;
    }
  }
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  write(process.stderr, `Error: ${detail}`);
  process.exitCode = 1;
});
