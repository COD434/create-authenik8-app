import type { PackageManager, StepName } from "./types.js";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

type RestartCommandOptions = {
  projectName: string;
  productionReady: boolean;
  resume: boolean;
  skipInstall?: boolean;
  packageManager?: PackageManager;
};

export function canResumeSetup(step: StepName): boolean {
  return step !== "start" && step !== "done";
}

export function restartCommand(options: RestartCommandOptions): string {
  const flags = [
    ...(options.packageManager ? ["--package-manager", options.packageManager] : []),
    ...(options.skipInstall ? ["--no-install"] : []),
    ...(options.productionReady ? ["--production-ready"] : []),
    ...(options.resume ? ["--resume"] : []),
  ];

  return ["npx", "create-authenik8-app", options.projectName, ...flags].join(" ");
}

export function interruptionExitCode(signal: ShutdownSignal): number {
  return signal === "SIGINT" ? 130 : 143;
}
