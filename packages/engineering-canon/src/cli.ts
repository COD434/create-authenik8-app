#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  auditProject,
  canonFingerprint,
  createCanonBaseline,
  formatCanonFindings,
  parseCanonBaseline,
} from "./audit.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const strict = args.includes("--strict");
let baselinePath: string | null = null;
let writeBaselinePath: string | null = null;
const positional: string[] = [];

function fail(message: string): never {
  process.stderr.write(`canon audit: ${message}\n`);
  process.exit(2);
}

function optionValue(index: number, name: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) fail(`${name} needs a path`);
  return value;
}

for (let index = 0; index < args.length; index++) {
  const argument = args[index] ?? "";
  if (argument === "--json" || argument === "--strict") continue;
  if (argument === "--baseline") {
    baselinePath = optionValue(index, argument);
    index++;
    continue;
  }
  if (argument.startsWith("--baseline=")) {
    baselinePath = argument.slice("--baseline=".length);
    if (baselinePath === "") fail("--baseline needs a path");
    continue;
  }
  if (argument === "--write-baseline") {
    writeBaselinePath = optionValue(index, argument);
    index++;
    continue;
  }
  if (argument.startsWith("--write-baseline=")) {
    writeBaselinePath = argument.slice("--write-baseline=".length);
    if (writeBaselinePath === "") fail("--write-baseline needs a path");
    continue;
  }
  if (argument.startsWith("--")) fail(`unknown option ${argument}`);
  positional.push(argument);
}

if (positional.length > 1) {
  fail(`expected one directory, got ${positional.length}`);
}
const root = positional[0] ?? ".";

let baseline: ReadonlySet<string> | undefined;
if (baselinePath !== null) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(baselinePath, "utf8"));
  } catch (error) {
    fail(
      `could not read ${baselinePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    baseline = new Set(parseCanonBaseline(parsed).findings.map(canonFingerprint));
  } catch (error) {
    fail(`${baselinePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = await auditProject(
  root,
  writeBaselinePath === null
    ? { strict, ...(baseline === undefined ? {} : { baseline }) }
    : {},
);

if (writeBaselinePath !== null) {
  const document = createCanonBaseline(result.findings);
  await mkdir(path.dirname(path.resolve(writeBaselinePath)), { recursive: true });
  await writeFile(writeBaselinePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  process.stdout.write(
    `canon baseline: wrote ${document.findings.length} reviewed finding${
      document.findings.length === 1 ? "" : "s"
    } to ${writeBaselinePath}\n`,
  );
  process.exitCode = 0;
} else {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatCanonFindings(result)}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}
