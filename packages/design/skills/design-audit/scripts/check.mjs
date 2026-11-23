#!/usr/bin/env node
/**
 * design-audit script: run the Authenik8 design checks (A8-DS-001..004)
 * against a design-system directory and print the findings.
 *
 * usage: node check.mjs <design-system-dir> [--json]
 * exit:  0 nothing failed · 1 at least one check failed · 2 usage error
 *
 * Requires the built @authenik8/design dist relative to this script, or
 * override the location with A8_DESIGN_DIST (file URL or path).
 */

const args = process.argv.slice(2);
const json = args.includes("--json");
const dir = args.find((arg) => !arg.startsWith("--"));

if (!dir) {
  console.error("usage: node check.mjs <design-system-dir> [--json]");
  process.exit(2);
}

const distUrl = process.env.A8_DESIGN_DIST ?? new URL("../../../dist/index.js", import.meta.url).href;
const design = await import(distUrl);

const result = await design.runDesignChecks(dir);
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(design.formatFindings(result));
}
process.exit(result.ok ? 0 : 1);
