import { inflateRawSync } from "node:zlib";

export const MAX_IMPORT_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_IMPORT_FILES = 2_000;
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

export type ProjectImportFile = { path: string; data: Buffer };
export type ProjectImport = { files: ProjectImportFile[]; skipped: number };

export class ProjectImportError extends Error {}

function invalid(message: string): never {
  throw new ProjectImportError(message);
}

function safeArchivePath(name: string): string {
  if (name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\0")) {
    return invalid("The ZIP contains a rooted or invalid file path.");
  }
  const parts = name.replace(/\/$/, "").split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]$/.test(part) || /[<>:"|?*\x00-\x1f]/.test(part))) {
    return invalid("The ZIP contains an unsafe file path.");
  }
  if (parts.some((part) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || part.endsWith(".") || part.endsWith(" "))) {
    return invalid("The ZIP contains a path that cannot be safely written on this system.");
  }
  return parts.join("/");
}

function shouldSkip(name: string): boolean {
  const parts = name.split("/");
  return parts.some((part) => part === ".git" || part === ".authenik8" || part === "node_modules" || part === "__MACOSX")
    || parts.some((part) => /^\.env(?:\.|$)/i.test(part))
    || /\.(?:pem|key|p12|pfx|jks)$/i.test(name)
    || /(^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/i.test(name);
}

/** Locate the End of Central Directory record, scanning backward from the end. */
function findEndOfCentralDirectory(input: Buffer): number {
  const minEocd = Math.max(0, input.length - 22 - 0xffff);
  for (let cursor = input.length - 22; cursor >= minEocd; cursor--) {
    if (input.readUInt32LE(cursor) === 0x06054b50) return cursor;
  }
  return invalid("This file is not a supported ZIP archive.");
}

type CentralSummary = { entryCount: number; centralSize: number; centralOffset: number };

/** Validate the EOCD fields and return the central-directory bounds. */
function readCentralSummary(input: Buffer, eocd: number): CentralSummary {
  const disk = input.readUInt16LE(eocd + 4);
  const centralDisk = input.readUInt16LE(eocd + 6);
  const diskEntries = input.readUInt16LE(eocd + 8);
  const entryCount = input.readUInt16LE(eocd + 10);
  const centralSize = input.readUInt32LE(eocd + 12);
  const centralOffset = input.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount === 0xffff
    || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return invalid("Multi-part and ZIP64 archives are not supported yet.");
  }
  if (entryCount > MAX_IMPORT_FILES || centralOffset + centralSize > eocd) {
    return invalid("The ZIP has too many files or an invalid directory.");
  }
  return { entryCount, centralSize, centralOffset };
}

export type CentralDirectoryRecord = {
  name: string;
  isDirectory: boolean;
  isSpecialUnixEntry: boolean;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  expectedCrc: number;
  localOffset: number;
};

/** Read one central-directory record and validate its place in the directory. */
function readCentralRecord(
  input: Buffer,
  cursor: number,
  summary: CentralSummary,
  decoder: InstanceType<typeof TextDecoder>,
): { record: CentralDirectoryRecord; next: number } {
  if (cursor + 46 > summary.centralOffset + summary.centralSize || input.readUInt32LE(cursor) !== 0x02014b50) {
    return invalid("The ZIP has a malformed file directory.");
  }
  const recordStart = cursor;
  const madeBy = input.readUInt16LE(cursor + 4) >>> 8;
  const flags = input.readUInt16LE(cursor + 8);
  const method = input.readUInt16LE(cursor + 10);
  const expectedCrc = input.readUInt32LE(cursor + 16);
  const compressedSize = input.readUInt32LE(cursor + 20);
  const uncompressedSize = input.readUInt32LE(cursor + 24);
  const nameLength = input.readUInt16LE(cursor + 28);
  const extraLength = input.readUInt16LE(cursor + 30);
  const commentLength = input.readUInt16LE(cursor + 32);
  const startDisk = input.readUInt16LE(cursor + 34);
  const externalAttrs = input.readUInt32LE(cursor + 38);
  const localOffset = input.readUInt32LE(cursor + 42);
  const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
  if (recordEnd > summary.centralOffset + summary.centralSize || startDisk !== 0 || localOffset + 30 > input.length) {
    return invalid("The ZIP has an invalid file record.");
  }
  if ((flags & 1) !== 0 || (flags & 0x40) !== 0) return invalid("Encrypted ZIP files are not supported.");

  let rawName: string;
  try { rawName = decoder.decode(input.subarray(recordStart + 46, recordStart + 46 + nameLength)); }
  catch { return invalid("The ZIP contains a file name that is not valid UTF-8."); }
  const isDirectory = rawName.endsWith("/");
  const name = safeArchivePath(rawName);
  let isSpecialUnixEntry = false;
  if (madeBy === 3) {
    const unixType = (externalAttrs >>> 16) & 0xf000;
    if (unixType !== 0 && unixType !== 0x8000) isSpecialUnixEntry = true;
  }
  return {
    record: { name, isDirectory, isSpecialUnixEntry, method, compressedSize, uncompressedSize, expectedCrc, localOffset },
    next: recordEnd,
  };
}

/** Inflate one file body and prove it against the directory's size and CRC. */
function extractEntryData(input: Buffer, record: CentralDirectoryRecord, centralOffset: number): Buffer {
  const localNameLength = input.readUInt16LE(record.localOffset + 26);
  const localExtraLength = input.readUInt16LE(record.localOffset + 28);
  const dataStart = record.localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + record.compressedSize;
  if (input.readUInt32LE(record.localOffset) !== 0x04034b50 || dataEnd > centralOffset) {
    return invalid("The ZIP contains a malformed file body.");
  }
  let data: Buffer;
  try {
    data = record.method === 0
      ? Buffer.from(input.subarray(dataStart, dataEnd))
      : inflateRawSync(input.subarray(dataStart, dataEnd), { maxOutputLength: MAX_IMPORT_BYTES + 1 });
  } catch {
    return invalid(`Could not decompress ${record.name}.`);
  }
  if (data.length !== record.uncompressedSize || crc32(data) !== record.expectedCrc) {
    return invalid(`The ZIP data for ${record.name} is incomplete or corrupted.`);
  }
  return data;
}

/** GitHub and most desktop tools wrap the project in one folder; remove it. */
function stripSharedRootFolder(parsed: ProjectImportFile[]): ProjectImportFile[] {
  const firstParts = parsed.map((entry) => entry.path.split("/"));
  const rootCandidate = firstParts[0]?.[0];
  const sharedRoot = rootCandidate !== undefined
    && firstParts.every((parts) => parts.length > 1 && parts[0] === rootCandidate)
    ? rootCandidate
    : null;
  return parsed.map((entry) => ({
    ...entry,
    path: sharedRoot === null ? entry.path : entry.path.slice(sharedRoot.length + 1),
  }));
}

/** Read a ZIP central directory without extracting paths through a shell. */
export function parseProjectZip(input: Buffer): ProjectImport {
  if (input.length < 22 || input.length > MAX_IMPORT_ARCHIVE_BYTES) {
    return invalid(`Choose a ZIP no larger than ${Math.floor(MAX_IMPORT_ARCHIVE_BYTES / 1024 / 1024)} MB.`);
  }

  const summary = readCentralSummary(input, findEndOfCentralDirectory(input));
  const decoder = new TextDecoder("utf-8", { fatal: true });

  const parsed: ProjectImportFile[] = [];
  let skipped = 0;
  let totalBytes = 0;
  let cursor = summary.centralOffset;

  for (let index = 0; index < summary.entryCount; index++) {
    const { record, next } = readCentralRecord(input, cursor, summary, decoder);
    cursor = next;
    if (record.isDirectory) { skipped++; continue; }
    if (record.isSpecialUnixEntry) {
      return invalid("The ZIP contains a link or special file; only regular files can be imported.");
    }
    if (shouldSkip(record.name)) { skipped++; continue; }
    if (record.compressedSize === 0xffffffff || record.uncompressedSize === 0xffffffff || record.localOffset === 0xffffffff) {
      return invalid("ZIP64 files are not supported yet.");
    }
    if (record.uncompressedSize > MAX_IMPORT_BYTES || totalBytes + record.uncompressedSize > MAX_IMPORT_BYTES) {
      return invalid("The expanded project exceeds the 64 MB import limit.");
    }
    if (record.method !== 0 && record.method !== 8) {
      return invalid(`The ZIP uses an unsupported compression method (${record.method}).`);
    }
    const data = extractEntryData(input, record, summary.centralOffset);
    totalBytes += data.length;
    parsed.push({ path: record.name, data });
  }

  const files = stripSharedRootFolder(parsed);

  const names = new Set<string>();
  for (const entry of files) {
    const key = entry.path.toLowerCase();
    if (names.has(key)) return invalid("The ZIP contains duplicate file names after removing its top-level folder.");
    names.add(key);
  }
  if (files.length === 0) return invalid("The ZIP has no importable project files.");
  return { files, skipped };
}

// Local copy shared with the ZIP writer to avoid weakening its public API.
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
