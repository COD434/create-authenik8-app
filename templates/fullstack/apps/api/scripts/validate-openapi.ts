import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "@readme/openapi-parser";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(apiDirectory, "../../integrations/lovable/openapi.json");
const source = await readFile(inputPath, "utf8");
const result = await validate(JSON.parse(source));

if (!result.valid) {
  console.error("integrations/lovable/openapi.json is not a valid OpenAPI document.");
  console.error(result.errors);
  process.exitCode = 1;
} else {
  console.log("integrations/lovable/openapi.json is valid OpenAPI 3.1.");
}
