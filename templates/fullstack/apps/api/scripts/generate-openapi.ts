import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openApiDocument } from "../src/openapi.js";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.resolve(apiDirectory, "../../integrations/lovable/openapi.json");
const output = `${JSON.stringify(openApiDocument, null, 2)}\n`;
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const committed = await readFile(outputPath, "utf8").catch(() => "");
  if (committed !== output) {
    console.error("integrations/lovable/openapi.json is stale. Run npm run openapi:generate.");
    process.exitCode = 1;
  } else {
    console.log("integrations/lovable/openapi.json is current.");
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  console.log(`Wrote ${path.relative(path.resolve(apiDirectory, "../.."), outputPath)}.`);
}
