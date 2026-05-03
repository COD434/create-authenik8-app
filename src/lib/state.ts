import fs from "fs-extra";
import path from "path";
import type { CliState, StepName } from "./types.js";
import { stepOrder } from "./constants.js";

let state: CliState;
let stateFile: string;

export function initState(initialState: CliState, file: string) {
  state = initialState;
  stateFile = file;
}

export function getState(): CliState {
  return state;
}

export function saveState(update: Partial<CliState>) {
  state = { ...state, ...update };
  fs.ensureDirSync(path.dirname(stateFile));
  fs.writeJsonSync(stateFile, state, { spaces: 2 });
}

export function loadState(file: string): CliState | null {
  if (!fs.existsSync(file)) return null;
  return fs.readJsonSync(file) as CliState;
}

export function clearState() {
  if (fs.existsSync(stateFile)) {
    fs.removeSync(stateFile);
  }
}

export function hasReachedStep(currentStep: StepName, targetStep: StepName) {
  return stepOrder.indexOf(currentStep) >= stepOrder.indexOf(targetStep);
}
