#!/usr/bin/env node
/**
 * design-css script: render a design-system bundle's tokens as CSS custom
 * properties on :root (or a custom selector).
 *
 * usage: node css.mjs <design-system-dir> [--out <file>] [--selector ":root"]
 * exit:  0 rendered · 1 load failure · 2 usage error
 */

const args = process.argv.slice(2);
let dir = null;
let out = null;
let selector = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") out = args[++i];
  else if (args[i] === "--selector") selector = args[++i];
  else dir = args[i];
}

if (!dir) {
  console.error("usage: node css.mjs <design-system-dir> [--out <file>] [--selector \":root\"]");
  process.exit(2);
}

const distUrl = process.env.A8_DESIGN_DIST ?? new URL("../../../dist/index.js", import.meta.url).href;
const design = await import(distUrl);
const { writeFile } = await import("node:fs/promises");

let bundle;
try {
  bundle = await design.loadDesignSystem(dir);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const css = design.renderTokensCss(bundle.tokens, selector ? { selector } : {});
if (out) {
  await writeFile(out, css, "utf8");
  console.log(`wrote ${out}`);
} else {
  console.log(css);
}
