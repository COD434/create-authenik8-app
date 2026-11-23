import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { MAX_IMPORT_ARCHIVE_BYTES, parseProjectZip, ProjectImportError, type ProjectImport } from "../import.js";
import { readBinaryBody, sendJson } from "../http.js";
import { collectProjectFiles, importFileState, inspectProjectImport } from "../project-files.js";
import { resolveInsideSandbox } from "../tools.js";
import type { RouteContext } from "../studio-types.js";
import { createZip } from "../zip.js";

async function exportProject(ctx: RouteContext): Promise<void> {
  const { deps, res } = ctx;
  // Consistent with /api/run and /api/agent: the sandbox may not exist
  // yet (nothing has been generated). Bootstrap it so a first-run
  // export returns a valid empty ZIP instead of a 500.
  await mkdir(deps.sandboxRoot, { recursive: true });
  const files = await collectProjectFiles(deps.sandboxRoot);
  const zip = createZip(files);
  res.writeHead(200, {
    "content-type": "application/zip",
    "content-disposition": 'attachment; filename="authenik8-project.zip"',
    "cache-control": "no-store",
  });
  res.end(zip);
}

async function applyImport(ctx: RouteContext, imported: ProjectImport): Promise<void> {
  const { deps, res, runner, session, url } = ctx;
  await mkdir(deps.sandboxRoot, { recursive: true });
  const preview = await inspectProjectImport(deps.sandboxRoot, imported.files);
  if (url.pathname === "/api/import/preview") {
    sendJson(res, 200, {
      files: preview.files,
      conflicts: preview.conflicts,
      blocked: preview.blocked,
      skipped: imported.skipped,
      totalBytes: imported.files.reduce((total, file) => total + file.data.length, 0),
    });
    return;
  }

  if (session.agentBusy || session.chatBusy || runner.isRunning()) {
    sendJson(res, 409, { error: "Stop the active build or project run before importing files." });
    return;
  }

  if (preview.blocked > 0) {
    sendJson(res, 409, { error: "Some paths collide with protected files or directories. Nothing was imported.", blocked: preview.blocked });
    return;
  }
  const replaceConflicts = url.searchParams.get("replace") === "true";
  let written = 0;
  let preserved = 0;
  for (const file of imported.files) {
    const state = await importFileState(deps.sandboxRoot, file.path);
    if (state === "blocked") {
      sendJson(res, 409, { error: `The destination for ${file.path} changed during import. Stop the project and retry. Nothing further was imported.` });
      return;
    }
    if (state === "conflict" && !replaceConflicts) {
      preserved++;
      continue;
    }
    const target = resolveInsideSandbox(deps.sandboxRoot, file.path);
    if (target === null) {
      sendJson(res, 422, { error: `The destination for ${file.path} is not allowed.` });
      return;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.data, state === "conflict" ? { flag: "w" } : { flag: "wx" });
    written++;
  }
  sendJson(res, 200, {
    ok: true,
    written,
    preserved,
    skipped: imported.skipped,
    message: `${written} file${written === 1 ? "" : "s"} imported${preserved > 0 ? `; ${preserved} existing file${preserved === 1 ? " was" : "s were"} kept` : ""}.`,
  });
}

/** Project ZIP export and two-phase import (preview, then confirmed apply). */
export async function handleProjectRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url } = ctx;

  if (url.pathname === "/api/export" && req.method === "GET") {
    await exportProject(ctx);
    return true;
  }

  if ((url.pathname === "/api/import/preview" || url.pathname === "/api/import/apply") && req.method === "POST") {
    const archive = await readBinaryBody(req, MAX_IMPORT_ARCHIVE_BYTES);
    if (archive === null) {
      sendJson(res, 413, { error: `Choose a ZIP no larger than ${Math.floor(MAX_IMPORT_ARCHIVE_BYTES / 1024 / 1024)} MB.` });
      return true;
    }
    let imported: ProjectImport;
    try {
      imported = parseProjectZip(archive);
    } catch (error) {
      if (error instanceof ProjectImportError) {
        sendJson(res, 422, { error: error.message });
        return true;
      }
      throw error;
    }
    await applyImport(ctx, imported);
    return true;
  }

  return false;
}
