import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "@readme/openapi-parser";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDirectory = path.resolve(apiDirectory, "../..");
const lovableArtifact = path.resolve(projectDirectory, "integrations/lovable/openapi.json");
const inputPaths = [
  path.resolve(apiDirectory, "openapi.json"),
  ...(existsSync(lovableArtifact) ? [lovableArtifact] : []),
];

for (const inputPath of inputPaths) {
  const relativePath = path.relative(projectDirectory, inputPath);
  const source = await readFile(inputPath, "utf8");
  const result = await validate(JSON.parse(source));

  if (!result.valid) {
    console.error(`${relativePath} is not a valid OpenAPI document.`);
    console.error(result.errors);
    process.exitCode = 1;
  } else {
    console.log(`${relativePath} is valid OpenAPI 3.1.`);
  }
}
