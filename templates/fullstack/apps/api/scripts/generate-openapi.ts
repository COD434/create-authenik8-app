import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openApiDocument } from "../src/openapi.js";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDirectory = path.resolve(apiDirectory, "../..");
const lovableDirectory = path.resolve(projectDirectory, "integrations/lovable");
const outputPaths = [
  path.resolve(apiDirectory, "openapi.json"),
  ...(existsSync(lovableDirectory)
    ? [path.resolve(lovableDirectory, "openapi.json")]
    : []),
];
const output = `${JSON.stringify(openApiDocument, null, 2)}\n`;
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  for (const outputPath of outputPaths) {
    const relativePath = path.relative(projectDirectory, outputPath);
    const committed = await readFile(outputPath, "utf8").catch(() => "");
    if (committed !== output) {
      console.error(`${relativePath} is stale. Run npm run openapi:generate.`);
      process.exitCode = 1;
    } else {
      console.log(`${relativePath} is current.`);
    }
  }
} else {
  for (const outputPath of outputPaths) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Wrote ${path.relative(projectDirectory, outputPath)}.`);
  }
}
