import fs from "fs-extra";
import path from "path";
import type { CliState, StepName } from "./types.js";
import { stepOrder } from "./constants.js";
import { cliStateSchema, firstZodIssue } from "./schemas.js";

let state: CliState;
let stateFile: string;

export function initState(initialState: CliState, file: string) {
  const result = cliStateSchema.safeParse(initialState);
  if (!result.success) {
    throw new Error(`Invalid CLI state: ${firstZodIssue(result.error)}`);
  }
  state = result.data;
  stateFile = file;
}

export function getState(): CliState {
  return state;
}

export function saveState(update: Partial<CliState>) {
  const result = cliStateSchema.safeParse({ ...state, ...update });
  if (!result.success) {
    throw new Error(`Invalid CLI state: ${firstZodIssue(result.error)}`);
  }
  state = result.data;
  fs.ensureDirSync(path.dirname(stateFile));
  fs.writeJsonSync(stateFile, state, { spaces: 2 });
}

export function loadState(file: string): CliState | null {
  if (!fs.existsSync(file)) return null;
  const result = cliStateSchema.safeParse(fs.readJsonSync(file));
  if (!result.success) {
    throw new Error(`Saved setup state is invalid: ${firstZodIssue(result.error)}`);
  }
  return result.data;
}

export function clearState() {
  if (fs.existsSync(stateFile)) {
    fs.removeSync(stateFile);
  }

  const stateDir = path.dirname(stateFile);
  if (fs.existsSync(stateDir) && fs.readdirSync(stateDir).length === 0) {
    fs.removeSync(stateDir);
  }
}

export function hasReachedStep(currentStep: StepName, targetStep: StepName) {
  return stepOrder.indexOf(currentStep) >= stepOrder.indexOf(targetStep);
}
