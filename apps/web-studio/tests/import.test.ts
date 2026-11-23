import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { parseProjectZip, ProjectImportError } from "../src/import.js";
import { createZip } from "../src/zip.js";

function deflateZip(name: string, data: Buffer): Buffer {
  const zip = createZip([{ name, data }]);
  const eocd = zip.length - 22;
  const oldCentralOffset = zip.readUInt32LE(eocd + 16);
  const localNameLength = zip.readUInt16LE(26);
  const localExtraLength = zip.readUInt16LE(28);
  const dataStart = 30 + localNameLength + localExtraLength;
  const central = zip.subarray(oldCentralOffset);
  const compressed = deflateRawSync(data);
  const result = Buffer.concat([zip.subarray(0, dataStart), compressed, central]);
  const centralOffset = dataStart + compressed.length;
  result.writeUInt16LE(8, 8);
  result.writeUInt32LE(compressed.length, 18);
  result.writeUInt16LE(8, centralOffset + 10);
  result.writeUInt32LE(compressed.length, centralOffset + 20);
  result.writeUInt32LE(centralOffset, result.length - 22 + 16);
  return result;
}

describe("parseProjectZip", () => {
  it("reads stored and deflated archives and removes a shared root folder", () => {
    const zip = deflateZip("my-frontend/index.html", Buffer.from("<main>hello</main>"));
    const imported = parseProjectZip(zip);
    expect(imported.files.map((file) => file.path)).toEqual(["index.html"]);
    expect(imported.files[0]!.data.toString()).toBe("<main>hello</main>");
  });

  it("skips environment files, dependencies, Git metadata, and local history", () => {
    const zip = createZip([
      { name: "frontend/index.html", data: Buffer.from("app") },
      { name: "frontend/.env.local", data: Buffer.from("secret") },
      { name: "frontend/node_modules/pkg/index.js", data: Buffer.from("dependency") },
      { name: "frontend/.git/config", data: Buffer.from("repository") },
      { name: "frontend/.authenik8/session.jsonl", data: Buffer.from("history") },
    ]);
    const imported = parseProjectZip(zip);
    expect(imported.files.map((file) => file.path)).toEqual(["index.html"]);
    expect(imported.skipped).toBe(4);
  });

  it("rejects traversal paths and corrupted file bodies", () => {
    const traversal = createZip([{ name: "../outside.txt", data: Buffer.from("no") }]);
    expect(() => parseProjectZip(traversal)).toThrow(ProjectImportError);

    const corrupted = createZip([{ name: "index.html", data: Buffer.from("valid") }]);
    corrupted[30 + "index.html".length] ^= 1;
    expect(() => parseProjectZip(corrupted)).toThrow(/incomplete or corrupted/);
  });
});
