#!/usr/bin/env node
import {
  doctorHelp,
  formatDiagnosticExplanation,
  formatDoctorFixPlan,
  formatDoctorReport,
} from "../commands/doctor/output.js";
import {
  doctorExitCode,
  DoctorUsageError,
  parseDoctorArguments,
  runDoctor,
} from "../commands/doctor/index.js";
import { DoctorProjectError } from "../commands/doctor/context.js";
import { diagnosticDefinition } from "../commands/doctor/catalog.js";
import { DoctorFixError } from "../commands/doctor/fixes.js";
import {
  DoctorReportError,
  writeDoctorSupportReport,
} from "../commands/doctor/report.js";
import { addHelp, formatAddResult, formatRecipeList } from "../commands/add/output.js";
import { AddUsageError, parseAddArguments, runAdd } from "../commands/add/index.js";
import { AddProjectError } from "../commands/add/context.js";
import { AddRecipeError } from "../commands/add/plan.js";
import {
  formatUpgradeAcknowledgement,
  formatUpgradePlan,
  upgradeHelp,
} from "../commands/upgrade/output.js";
import {
  parseUpgradeArguments,
  runUpgrade,
  upgradeCheckExitCode,
  UpgradeUsageError,
} from "../commands/upgrade/index.js";
import { acknowledgeUpgrade } from "../commands/upgrade/acknowledge.js";
import { UpgradeProjectError } from "../commands/upgrade/context.js";
import {
  DoctorProjectError as OpsProjectError,
  OpsMutationError,
  OpsReceiptError,
  OpsRuntimeError,
  OpsSigningError,
  OpsUsageError,
  opsExitCode,
  parseOpsArguments,
  runOps,
} from "../commands/ops/index.js";
import {
  formatOpsError,
  formatOpsResult,
  opsHelp,
} from "../commands/ops/output.js";
import {
  parseStudioArguments,
  runStudio,
  StudioUsageError,
} from "../commands/studio/index.js";
import { StudioProjectError } from "../commands/studio/snapshot.js";
import {
  formatStudioStarted,
  studioHelp,
} from "../commands/studio/output.js";
import { resolveRootCommand } from "../lib/rootCommand.js";
import {
  LovableDoctorUsageError,
  lovableDoctorHelp,
  parseLovableDoctorArguments,
  runLovableDoctorCommand,
} from "../commands/lovableDoctor/index.js";

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
      else if (options.acknowledge) {
        write(
          process.stdout,
          formatUpgradeAcknowledgement(
            await acknowledgeUpgrade(options.directory),
            options.json,
          ),
        );
      } else {
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

  if (route.name === "ops") {
    const json = route.args.includes("--json");
    try {
      const options = parseOpsArguments(route.args);
      if (options.help) {
        write(process.stdout, opsHelp());
      } else {
        const result = await runOps(options);
        write(process.stdout, formatOpsResult(result, options.json));
        process.exitCode = opsExitCode(result);
      }
    } catch (error) {
      if (error instanceof OpsUsageError) {
        write(
          process.stderr,
          json
            ? formatOpsError("OPS_USAGE", error.message, true)
            : `${formatOpsError("OPS_USAGE", error.message)}\n${opsHelp()}`,
        );
        process.exitCode = 2;
      } else if (error instanceof OpsProjectError) {
        write(
          process.stderr,
          formatOpsError("OPS_PROJECT", error.message, json),
        );
        process.exitCode = 2;
      } else if (error instanceof OpsMutationError) {
        write(
          process.stderr,
          formatOpsError("OPS_MUTATION", error.message, json),
        );
        process.exitCode = 4;
      } else if (
        error instanceof OpsRuntimeError
        || error instanceof OpsReceiptError
        || error instanceof OpsSigningError
      ) {
        write(
          process.stderr,
          formatOpsError("OPS_PREREQUISITE", error.message, json),
        );
        process.exitCode = 3;
      } else if (error instanceof DoctorReportError) {
        write(
          process.stderr,
          formatOpsError("OPS_REPORT", error.message, json),
        );
        process.exitCode = 5;
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        write(
          process.stderr,
          formatOpsError(
            "OPS_INTERNAL",
            `Operational maintenance could not complete: ${detail}`,
            json,
          ),
        );
        process.exitCode = 3;
      }
    }
    return;
  }

  if (route.name === "studio") {
    try {
      const options = parseStudioArguments(route.args);
      if (options.help) {
        write(process.stdout, studioHelp());
      } else {
        const studio = await runStudio(options);
        write(process.stdout, formatStudioStarted(studio.url, options));

        let stopping = false;
        const stop = async () => {
          if (stopping) return;
          stopping = true;
          try {
            await studio.close();
            write(process.stdout, "Authenik8 Studio stopped.");
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            write(process.stderr, `Error: Studio could not stop cleanly: ${detail}`);
            process.exitCode = 1;
          }
        };
        process.once("SIGINT", () => void stop());
        process.once("SIGTERM", () => void stop());
      }
    } catch (error) {
      if (error instanceof StudioUsageError) {
        write(process.stderr, `Error: ${error.message}\n${studioHelp()}`);
        process.exitCode = 2;
      } else if (
        error instanceof StudioProjectError
        || error instanceof DoctorProjectError
        || error instanceof UpgradeProjectError
      ) {
        write(process.stderr, `Error: ${error.message}`);
        process.exitCode = 2;
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        write(process.stderr, `Error: Studio could not start: ${detail}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  if (route.name === "doctor" && route.args[0] === "frontend") {
    try {
      process.exitCode = runLovableDoctorCommand(
        parseLovableDoctorArguments(route.args),
      );
    } catch (error) {
      if (error instanceof LovableDoctorUsageError) {
        write(process.stderr, `Error: ${error.message}\n${lovableDoctorHelp()}`);
        process.exitCode = 2;
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        write(process.stderr, `Error: Lovable Doctor could not complete: ${detail}`);
        process.exitCode = 3;
      }
    }
    return;
  }

  try {
    const options = parseDoctorArguments(route.args);
    if (options.help) {
      write(process.stdout, doctorHelp());
    } else if (options.explainId) {
      write(
        process.stdout,
        formatDiagnosticExplanation(
          diagnosticDefinition(options.explainId)!,
          Boolean(options.ci),
        ),
      );
    } else {
      const report = await runDoctor(
        options,
        options.fix && !options.dryRun && !options.json
          ? {
            onFixPlan: (fixes) => {
              write(
                process.stdout,
                formatDoctorFixPlan(fixes, Boolean(options.ci)),
              );
            },
          }
          : {},
      );
      const supportReportPath = options.report
        ? await writeDoctorSupportReport(report)
        : undefined;
      write(
        process.stdout,
        formatDoctorReport(
          report,
          options.json,
          Boolean(options.ci),
          supportReportPath,
        ),
      );
      process.exitCode = doctorExitCode(report, Boolean(options.strict));
    }
  } catch (error) {
    if (error instanceof DoctorUsageError) {
      write(process.stderr, `Error: ${error.message}\n${doctorHelp()}`);
      process.exitCode = 2;
    } else if (error instanceof DoctorProjectError) {
      write(process.stderr, `Error: ${error.message}`);
      process.exitCode = 2;
    } else if (error instanceof DoctorFixError) {
      write(process.stderr, `Error: ${error.message}`);
      process.exitCode = 4;
    } else if (error instanceof DoctorReportError) {
      write(process.stderr, `Error: ${error.message}`);
      process.exitCode = 5;
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      write(process.stderr, `Error: Doctor could not complete: ${detail}`);
      process.exitCode = 3;
    }
  }
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  write(process.stderr, `Error: ${detail}`);
  process.exitCode = 1;
});
