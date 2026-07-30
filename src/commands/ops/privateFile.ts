import { open, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "fs-extra";

export async function replacePrivateFile(
  filename: string,
  value: string,
  beforeCommit?: () => Promise<void>,
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}-${randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(temporaryPath, value, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const handle = await open(temporaryPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await beforeCommit?.();
    await rename(temporaryPath, filename);
  } finally {
    await fs.remove(temporaryPath);
  }
}
