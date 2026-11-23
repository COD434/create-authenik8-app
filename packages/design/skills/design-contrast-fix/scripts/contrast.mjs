#!/usr/bin/env node
/**
 * design-contrast-fix script: probe a foreground/background pair against
 * the WCAG 2.1 AA threshold without touching any file.
 *
 * usage: node contrast.mjs <fg-hex> <bg-hex> [body|large]
 * exit:  0 meets threshold · 1 below threshold · 2 usage error
 */

const [fg, bg, kindArg] = process.argv.slice(2);
if (!fg || !bg) {
  console.error("usage: node contrast.mjs <fg-hex> <bg-hex> [body|large]");
  process.exit(2);
}
const kind = kindArg === "large" ? "large" : "body";

const distUrl = process.env.A8_DESIGN_DIST ?? new URL("../../../dist/index.js", import.meta.url).href;
const design = await import(distUrl);

try {
  const ratio = design.contrastRatio(fg, bg);
  if (!Number.isFinite(ratio)) {
    console.log("error: colors must be 6-digit hex values like #0B1020");
    process.exit(2);
  }
  const threshold = design.contrastThreshold(kind);
  const meets = ratio >= threshold;
  console.log(
    `${fg} on ${bg}: ${ratio.toFixed(2)}:1 (needs ${threshold}:1 for ${kind} text) → ${meets ? "PASS" : "FAIL"}`,
  );
  process.exit(meets ? 0 : 1);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
