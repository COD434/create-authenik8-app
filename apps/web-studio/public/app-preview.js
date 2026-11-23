// Live preview pane, viewport controls, and the ZIP import dialog.

const previewPane = document.getElementById("preview-pane");
const previewFrame = document.getElementById("preview-frame");

function showPreview() {
  previewPane.classList.add("open");
  previewPane.setAttribute("aria-hidden", "false");
  previewFrame.src = `/preview/?t=${Date.now()}`;
  setActiveNav("preview-btn", true);
  refreshIdleStatus();
}

function hidePreview() {
  previewPane.classList.remove("open");
  previewPane.setAttribute("aria-hidden", "true");
  previewFrame.src = "about:blank";
  setActiveNav("preview-btn", false);
  refreshIdleStatus();
}

document.getElementById("preview-btn").addEventListener("click", () => {
  if (previewPane.classList.contains("open")) hidePreview();
  else showPreview();
});

document.getElementById("preview-reload").addEventListener("click", showPreview);
document.getElementById("preview-close").addEventListener("click", hidePreview);

function resetImportDialog() {
  selectedImportFile = null;
  importBusy = false;
  importFileInput.value = "";
  importFilesList.replaceChildren();
  importFilesList.hidden = true;
  importStatus.textContent = "Choose a ZIP archive up to 32 MB.";
  importNewBtn.disabled = true;
  importReplaceBtn.disabled = true;
  importReplaceBtn.hidden = true;
}

function formatImportBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderImportPreview(preview) {
  importFilesList.replaceChildren();
  for (const file of preview.files.slice(0, 30)) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = file.path;
    const details = document.createElement("small");
    details.textContent = `${formatImportBytes(file.bytes)}${file.state === "conflict" ? " · already exists" : file.state === "blocked" ? " · protected path" : ""}`;
    item.append(name, details);
    importFilesList.appendChild(item);
  }
  importFilesList.hidden = preview.files.length === 0;
  const more = preview.files.length > 30 ? ` Showing 30 of ${preview.files.length}.` : "";
  const skipped = preview.skipped > 0 ? ` ${preview.skipped} folder or sensitive file${preview.skipped === 1 ? " was" : "s were"} excluded.` : "";
  if (preview.blocked > 0) {
    importStatus.textContent = `${preview.files.length} files · ${preview.conflicts} existing · ${preview.blocked} protected destination${preview.blocked === 1 ? "" : "s"}. Nothing can be imported until those paths are moved.${skipped}${more}`;
    importNewBtn.disabled = true;
    importReplaceBtn.disabled = true;
  } else {
    importStatus.textContent = `${preview.files.length} files · ${formatImportBytes(preview.totalBytes)}${preview.conflicts > 0 ? ` · ${preview.conflicts} will be kept unless you choose Replace` : ""}.${skipped}${more}`;
    importNewBtn.disabled = false;
    importReplaceBtn.hidden = preview.conflicts === 0;
    importReplaceBtn.disabled = preview.conflicts === 0;
  }
}

async function previewImportFile(file) {
  selectedImportFile = file;
  importStatus.textContent = `Reviewing ${file.name}…`;
  importNewBtn.disabled = true;
  importReplaceBtn.disabled = true;
  importReplaceBtn.hidden = true;
  importFilesList.replaceChildren();
  importFilesList.hidden = true;
  try {
    const response = await fetch("/api/import/preview", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: await file.arrayBuffer(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Import preview failed (${response.status}).`);
    renderImportPreview(body);
  } catch (error) {
    importStatus.textContent = error instanceof Error ? error.message : "Could not inspect this ZIP.";
  }
}

async function applyProjectImport(replaceConflicts) {
  if (selectedImportFile === null || importBusy) return;
  importBusy = true;
  importNewBtn.disabled = true;
  importReplaceBtn.disabled = true;
  importStatus.textContent = replaceConflicts ? "Importing and replacing the files you reviewed…" : "Importing new files and keeping existing files…";
  try {
    const response = await fetch(`/api/import/apply?replace=${replaceConflicts}`, {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: await selectedImportFile.arrayBuffer(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `Import failed (${response.status}).`);
    importStatus.textContent = body.message ?? "Project files imported.";
    if (previewPane.classList.contains("open")) showPreview();
    selectedImportFile = null;
    importFileInput.value = "";
    importNewBtn.disabled = true;
    importReplaceBtn.disabled = true;
  } catch (error) {
    importStatus.textContent = error instanceof Error ? error.message : "Could not import this ZIP.";
    importBusy = false;
    importNewBtn.disabled = false;
    importReplaceBtn.disabled = false;
  }
}

importBtn.addEventListener("click", () => {
  resetImportDialog();
  importDialog.showModal();
  importFileInput.focus();
});
importClose.addEventListener("click", () => importDialog.close());
importCancel.addEventListener("click", () => importDialog.close());
importDialog.addEventListener("close", resetImportDialog);
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files?.[0];
  if (file !== undefined) void previewImportFile(file);
});
importNewBtn.addEventListener("click", () => void applyProjectImport(false));
importReplaceBtn.addEventListener("click", () => void applyProjectImport(true));

const viewportButtons = [...document.querySelectorAll(".viewport-btn")];
function setPreviewViewport(viewport) {
  if (previewStage === null) return;
  previewStage.dataset.viewport = viewport;
  for (const button of viewportButtons) {
    const active = button.dataset.viewport === viewport;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
for (const button of viewportButtons) {
  button.addEventListener("click", () => setPreviewViewport(button.dataset.viewport ?? "desktop"));
}

