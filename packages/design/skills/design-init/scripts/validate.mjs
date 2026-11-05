#!/usr/bin/env node
/**
 * design-init script: validate a drafted tokens.json against the
 * @authenik8/design schema WITHOUT writing anything.
 *
 * usage: node validate.mjs <path-to-tokens.json>
 * exit:  0 valid · 1 invalid · 2 usage error
 */

const file = process.argv[2];
if (!file) {
  console.error("usage: node validate.mjs <path-to-tokens.json>");
  process.exit(2);
}

const distUrl = process.env.A8_DESIGN_DIST ?? new URL("../../../dist/index.js", import.meta.url).href;
const design = await import(distUrl);
const { readFile } = await import("node:fs/promises");

let source;
try {
  source = await readFile(file, "utf8");
} catch {
  console.error(`could not read ${file}`);
  process.exit(1);
}

let json;
try {
  json = JSON.parse(source);
} catch {
  console.log("invalid: not valid JSON");
  process.exit(1);
}

const parsed = design.designTokensSchema.safeParse(json);
if (!parsed.success) {
  console.log(`invalid: ${design.firstIssueMessage(parsed.error)}`);
  process.exit(1);
}

console.log(`valid: ${parsed.data.name} (schema version ${parsed.data.schemaVersion})`);
process.exit(0);
