#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "authenik8-lovable-client-"));
const destination = path.join(root, "integrations/lovable/vendor");

function pack(workspace, outputName) {
  const result = spawnSync(
    "npm",
    ["pack", "--workspace", workspace, "--json", "--pack-destination", temporaryDirectory],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `npm pack failed for ${workspace}`);
  }
  const report = JSON.parse(result.stdout);
  const entry = Array.isArray(report) ? report[0] : Object.values(report)[0];
  const filename = entry?.filename;
  if (!filename) throw new Error(`npm pack did not report an archive for ${workspace}`);
  const packedPaths = new Set(entry.files?.map((file) => file.path));
  for (const required of ["dist/index.js", "dist/index.d.ts", "package.json"]) {
    if (!packedPaths.has(required)) {
      throw new Error(`${workspace} archive is missing ${required}`);
    }
  }
  fs.copyFileSync(path.join(temporaryDirectory, filename), path.join(destination, outputName));
}

try {
  fs.mkdirSync(destination, { recursive: true });
  pack("@authenik8/contracts", "authenik8-contracts.tgz");
  pack("@authenik8/api-client", "authenik8-api-client.tgz");
  process.stdout.write([
    "Lovable client archives are ready:",
    "  integrations/lovable/vendor/authenik8-contracts.tgz",
    "  integrations/lovable/vendor/authenik8-api-client.tgz",
    "",
    "Copy both files into the frontend repository, then run:",
    "  npm install ./vendor/authenik8-contracts.tgz ./vendor/authenik8-api-client.tgz",
    "",
  ].join("\n"));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
