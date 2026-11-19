import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crc32, createZip, type ZipEntry } from "../src/zip.js";

const run = promisify(execFile);

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "a8-zip-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(Buffer.from("123456789", "utf8"))).toBe(0xCBF43926);
  });
});

describe("createZip", () => {
  it("produces an archive the OS can extract back to the original bytes", async () => {
    const entries: ZipEntry[] = [
      { name: "index.html", data: Buffer.from("<h1>exported</h1>", "utf8") },
      { name: "assets/style.css", data: Buffer.from("h1 { color: teal; }", "utf8") },
    ];
    const zip = createZip(entries);

    // ZIP magic numbers: local header at 0; EOCD signature sits 22 bytes from
    // the end (its own trailing fields are cd-offset high bytes + comment len).
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zip.subarray(zip.length - 22, zip.length - 18).toString("hex")).toBe("504b0506");

    const zipPath = path.join(dir, "out.zip");
    await writeFile(zipPath, zip);
    const extracted = path.join(dir, "out");
    await mkdir(extracted, { recursive: true });
    // tar is the OS extractor here on purpose: this machine's PATH can resolve
    // `powershell` to the Store pwsh alias, whose Expand-Archive -Force is
    // broken. bsdtar reads ZIPs on Windows, macOS, and Linux alike.
    await run("tar", ["-xf", zipPath, "-C", extracted]);

    expect(await readFile(path.join(extracted, "index.html"), "utf8")).toBe("<h1>exported</h1>");
    expect(await readFile(path.join(extracted, "assets", "style.css"), "utf8")).toBe("h1 { color: teal; }");
  });

  it("creates a valid empty archive", async () => {
    const zip = createZip([]);
    const zipPath = path.join(dir, "empty.zip");
    await writeFile(zipPath, zip);
    const extracted = path.join(dir, "empty");
    await mkdir(extracted, { recursive: true });
    await run("tar", ["-xf", zipPath, "-C", extracted]);
    const files = await readdir(extracted);
    expect(files).toHaveLength(0);
  });
});
