import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const outputDirectory = path.join(repositoryRoot, "studio");
const javascriptOutput = path.join(outputDirectory, "app.js");

await build({
  entryPoints: [path.join(repositoryRoot, "studio-src", "main.tsx")],
  outfile: javascriptOutput,
  bundle: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});

const assetBudgets = [
  { filename: javascriptOutput, maximumBytes: 1_100_000 },
  {
    filename: path.join(outputDirectory, "app.css"),
    maximumBytes: 175_000,
  },
];

for (const budget of assetBudgets) {
  const { size } = await fs.stat(budget.filename);
  if (size > budget.maximumBytes) {
    throw new Error(
      `${path.basename(budget.filename)} is ${size} bytes; `
      + `the Studio asset budget is ${budget.maximumBytes} bytes.`,
    );
  }
}
