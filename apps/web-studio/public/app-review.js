// CodeRabbit review and read-only subagent transcripts.

// --- CodeRabbit CLI review (explicit, read-only, external) ---

async function refreshCodeRabbitStatus() {
  codeRabbitState.textContent = "Checking CodeRabbit CLI…";
  codeRabbitRunBtn.disabled = true;
  try {
    const response = await fetch("/api/coderabbit/status");
    const status = await response.json();
    codeRabbitState.textContent = status.detail || "Could not read CodeRabbit status.";
    codeRabbitRunBtn.disabled = !(status.installed && status.authenticated && status.gitReady);
  } catch (error) {
    codeRabbitState.textContent = `Could not check setup: ${error.message}`;
  }
}

function openCodeRabbit(opener) {
  codeRabbitOpener = opener instanceof HTMLElement ? opener : modalOpener(codeRabbitBtn);
  codeRabbitOverlay.hidden = false;
  setModalBackgroundInert(codeRabbitOverlay, true);
  codeRabbitOutput.hidden = true;
  codeRabbitOutput.textContent = "";
  codeRabbitClose.focus();
  void refreshCodeRabbitStatus();
}

function closeCodeRabbit() {
  if (codeRabbitOverlay.hidden) return;
  codeRabbitOverlay.hidden = true;
  setModalBackgroundInert(codeRabbitOverlay, false);
  const opener = codeRabbitOpener;
  codeRabbitOpener = null;
  restoreModalFocus(opener, codeRabbitBtn);
}

codeRabbitBtn.addEventListener("click", () => openCodeRabbit(codeRabbitBtn));
codeRabbitClose.addEventListener("click", closeCodeRabbit);
codeRabbitRefresh.addEventListener("click", () => void refreshCodeRabbitStatus());
codeRabbitOverlay.addEventListener("mousedown", (event) => {
  if (event.target === codeRabbitOverlay) closeCodeRabbit();
});
codeRabbitRunBtn.addEventListener("click", async () => {
  if (codeRabbitRunBtn.disabled) return;
  const confirmed = window.confirm("Send the CodeRabbit CLI-selected uncommitted project changes to CodeRabbit for review? Check that secrets are excluded before continuing.");
  if (!confirmed) return;
  codeRabbitRunBtn.disabled = true;
  codeRabbitRefresh.disabled = true;
  codeRabbitState.textContent = "CodeRabbit is reviewing the uncommitted changes…";
  codeRabbitOutput.hidden = false;
  codeRabbitOutput.textContent = "Review in progress…";
  try {
    const response = await fetch("/api/coderabbit/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const result = await response.json();
    codeRabbitState.textContent = result.ok ? "Review complete." : "Review could not finish.";
    codeRabbitOutput.textContent = result.output || "No review output.";
  } catch (error) {
    codeRabbitState.textContent = "Review request failed.";
    codeRabbitOutput.textContent = error.message;
  } finally {
    codeRabbitRefresh.disabled = false;
    void refreshCodeRabbitStatus();
  }
});

// --- Subagent transcripts (read-only) ---

const subagentsBtn = document.getElementById("subagents-btn");
const subagentsModal = subagentsOverlay.querySelector(".subagents-modal");
const subagentsClose = document.getElementById("subagents-close");
const subagentsBack = document.getElementById("subagents-back");
const subagentsListEl = document.getElementById("subagents-list");
const subagentsListView = document.getElementById("subagents-list-view");
const subagentsTranscriptView = document.getElementById("subagents-transcript-view");
const subagentsTranscriptEl = document.getElementById("subagents-transcript");
const subagentsMeta = document.getElementById("subagents-meta");
const subagentsTitle = document.getElementById("subagents-title");
const SUBAGENT_DISPLAY_CHARS = 12_000;
let subagentsEpoch = 0;
let subagentsOpener = null;

function formatSubagentBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSubagentWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capSubagentText(value) {
  if (value.length <= SUBAGENT_DISPLAY_CHARS) return value;
  return `${value.slice(0, SUBAGENT_DISPLAY_CHARS)}\n... [truncated]`;
}

function trapOpenModalTab(event) {
  if (!paletteOverlay.hidden) {
    trapModalTab(event, paletteOverlay, paletteModal, paletteInput);
    return;
  }
  if (!settingsOverlay.hidden) {
    trapModalTab(event, settingsOverlay, settingsModal, settingsClose);
    return;
  }
  if (!agentOverlay.hidden) {
    trapModalTab(event, agentOverlay, agentModal, agentClose);
    return;
  }
  if (!templateOverlay.hidden) {
    trapModalTab(event, templateOverlay, templateModal, templateClose);
    return;
  }
  if (!aiIntegrationOverlay.hidden) {
    trapModalTab(event, aiIntegrationOverlay, aiIntegrationModal, aiIntegrationClose);
    return;
  }
  if (!subagentsOverlay.hidden) {
    trapModalTab(event, subagentsOverlay, subagentsModal, subagentsClose);
    return;
  }
  if (!codeRabbitOverlay.hidden) {
    trapModalTab(event, codeRabbitOverlay, codeRabbitModal, codeRabbitClose);
    return;
  }
  if (!shipOverlay.hidden) {
    trapModalTab(event, shipOverlay, shipModal, shipClose);
  }
}

document.addEventListener("keydown", trapOpenModalTab);
document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!paletteOverlay.hidden) {
    if (target instanceof Node && paletteModal.contains(target)) return;
    focusModalFirst(paletteModal, paletteInput);
    return;
  }
  if (!settingsOverlay.hidden) {
    if (target instanceof Node && settingsModal.contains(target)) return;
    focusModalFirst(settingsModal, settingsClose);
    return;
  }
  if (!agentOverlay.hidden) {
    if (target instanceof Node && agentModal.contains(target)) return;
    focusModalFirst(agentModal, agentClose);
    return;
  }
  if (!templateOverlay.hidden) {
    if (target instanceof Node && templateModal.contains(target)) return;
    focusModalFirst(templateModal, templateClose);
    return;
  }
  if (!aiIntegrationOverlay.hidden) {
    if (target instanceof Node && aiIntegrationModal.contains(target)) return;
    focusModalFirst(aiIntegrationModal, aiIntegrationClose);
    return;
  }
  if (!shipOverlay.hidden) {
    if (target instanceof Node && shipModal.contains(target)) return;
    focusModalFirst(shipModal, shipClose);
    return;
  }
  if (!codeRabbitOverlay.hidden) {
    if (target instanceof Node && codeRabbitModal.contains(target)) return;
    focusModalFirst(codeRabbitModal, codeRabbitClose);
    return;
  }
  if (subagentsOverlay.hidden) return;
  if (target instanceof Node && subagentsModal.contains(target)) return;
  focusModalFirst(subagentsModal, subagentsClose);
});

function resetSubagentView() {
  subagentsEpoch++;
  subagentsTitle.textContent = "Subagent runs";
  subagentsTranscriptView.hidden = true;
  subagentsListView.hidden = false;
  subagentsTranscriptEl.textContent = "";
  subagentsMeta.textContent = "";
}

function closeSubagents() {
  if (subagentsOverlay.hidden) return;
  subagentsOverlay.hidden = true;
  setModalBackgroundInert(subagentsOverlay, false);
  resetSubagentView();
  const opener = subagentsOpener;
  subagentsOpener = null;
  restoreModalFocus(opener, subagentsBtn);
}

function openSubagents() {
  if (!subagentsOverlay.hidden) {
    subagentsClose.focus();
    return;
  }
  subagentsOpener = modalOpener(subagentsBtn);
  subagentsOverlay.hidden = false;
  setModalBackgroundInert(subagentsOverlay, true);
  resetSubagentView();
  subagentsClose.focus();
  void loadSubagents();
}

function openSubagentTranscriptFromTool(id, opener) {
  if (subagentsOverlay.hidden) {
    subagentsOpener = opener instanceof HTMLElement ? opener : modalOpener(subagentsBtn);
    subagentsOverlay.hidden = false;
    setModalBackgroundInert(subagentsOverlay, true);
    resetSubagentView();
  }
  void openSubagentTranscript(id);
}

function shortSubagentId(id) {
  const separator = id.indexOf("-");
  const uuid = separator === -1 ? id : id.slice(separator + 1);
  return uuid.slice(0, 8);
}

function subagentRow(log) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "subagent-row";

  const badge = document.createElement("span");
  badge.className = `subagent-badge ${log.kind}`;
  badge.textContent = log.label;

  const body = document.createElement("span");
  body.className = "subagent-row-body";

  const preview = document.createElement("span");
  preview.className = "subagent-preview";
  preview.textContent = log.preview || "No task recorded";

  const shortId = shortSubagentId(log.id);
  const meta = document.createElement("span");
  meta.className = "subagent-meta";
  meta.title = log.id;
  meta.textContent = [
    formatSubagentBytes(log.bytes),
    formatSubagentWhen(log.modifiedAt),
    shortId === "" ? "" : `ID\u00A0${shortId}`,
  ]
    .filter((part) => part !== "")
    .join(" · ");

  body.append(preview, meta);
  row.append(badge, body);
  row.addEventListener("click", () => {
    void openSubagentTranscript(log.id);
  });
  return row;
}

async function loadSubagents() {
  const epoch = subagentsEpoch;
  subagentsListEl.textContent = "Loading transcripts...";
  try {
    const res = await fetch("/api/subagents");
    if (epoch !== subagentsEpoch) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (epoch !== subagentsEpoch) return;
    const logs = Array.isArray(body.logs) ? body.logs : [];
    subagentsListEl.textContent = "";
    if (logs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "subagents-empty";
      empty.textContent = "No subagent runs yet. Explorer, reviewer, and builder reports appear here after a delegated task.";
      subagentsListEl.appendChild(empty);
      return;
    }
    for (const log of logs) {
      if (typeof log !== "object" || log === null) continue;
      if (typeof log.id !== "string" || typeof log.kind !== "string") continue;
      subagentsListEl.appendChild(subagentRow(log));
    }
  } catch (error) {
    if (epoch !== subagentsEpoch) return;
    subagentsListEl.textContent = `Could not load subagent runs: ${error.message}`;
  }
}

function appendSubagentMessage(parent, role, text, roleLabel = role === "user" ? "Task" : "Child") {
  const block = document.createElement("div");
  block.className = `subagent-message ${role}`;
  const label = document.createElement("span");
  label.className = "subagent-role";
  label.textContent = roleLabel;
  const content = document.createElement("div");
  content.className = "subagent-text";
  content.textContent = text;
  block.append(label, content);
  parent.appendChild(block);
}

function appendSubagentSystem(parent, text) {
  const details = document.createElement("details");
  details.className = "subagent-system";
  const summary = document.createElement("summary");
  summary.textContent = "System prompt";
  const pre = document.createElement("pre");
  pre.textContent = text;
  details.append(summary, pre);
  parent.appendChild(details);
}

function appendSubagentCall(parent, call) {
  const details = document.createElement("details");
  details.className = "subagent-call";
  const summary = document.createElement("summary");
  const name = typeof call.name === "string" ? call.name : "tool";
  summary.textContent = `Tool call · ${name}`;
  const pre = document.createElement("pre");
  pre.textContent = capSubagentText(typeof call.arguments === "string" ? call.arguments : "");
  details.append(summary, pre);
  parent.appendChild(details);
}

function appendSubagentTool(parent, name, text) {
  const details = document.createElement("details");
  details.className = "subagent-tool";
  const summary = document.createElement("summary");
  summary.textContent = `${name} result · ${text.length} chars`;
  const pre = document.createElement("pre");
  pre.textContent = capSubagentText(text);
  details.append(summary, pre);
  parent.appendChild(details);
}

function renderSubagentTranscript(body) {
  subagentsTranscriptEl.textContent = "";
  if (body.truncated === true) {
    const note = document.createElement("p");
    note.className = "subagent-note";
    note.textContent = "This transcript is larger than the viewer limit, so only its task preview and metadata are shown. The full log remains on disk.";
    subagentsTranscriptEl.appendChild(note);
    if (typeof body.preview === "string" && body.preview.length > 0) {
      appendSubagentMessage(subagentsTranscriptEl, "user", body.preview, "Task preview");
    }
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const toolNames = new Map();
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) continue;
    for (const call of message.toolCalls) {
      if (typeof call !== "object" || call === null) continue;
      if (typeof call.id === "string" && typeof call.name === "string") {
        toolNames.set(call.id, call.name);
      }
    }
  }

  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    if (typeof message.content !== "string") continue;
    if (message.role === "system") {
      appendSubagentSystem(subagentsTranscriptEl, message.content);
    } else if (message.role === "user" || message.role === "assistant") {
      if (message.content.length > 0) {
        appendSubagentMessage(subagentsTranscriptEl, message.role, message.content);
      }
      if (message.role === "assistant" && Array.isArray(message.toolCalls)) {
        for (const call of message.toolCalls) {
          if (typeof call !== "object" || call === null) continue;
          appendSubagentCall(subagentsTranscriptEl, call);
        }
      }
    } else if (message.role === "tool") {
      const name = typeof message.toolCallId === "string"
        ? toolNames.get(message.toolCallId) ?? "tool"
        : "tool";
      appendSubagentTool(subagentsTranscriptEl, name, message.content);
    }
  }

  if (subagentsTranscriptEl.childElementCount === 0) {
    const empty = document.createElement("p");
    empty.className = "subagents-empty";
    empty.textContent = "This transcript has no displayable messages.";
    subagentsTranscriptEl.appendChild(empty);
  }
}

async function openSubagentTranscript(id) {
  subagentsEpoch++;
  const epoch = subagentsEpoch;
  subagentsListView.hidden = true;
  subagentsTranscriptView.hidden = false;
  subagentsTitle.textContent = "Subagent transcript";
  subagentsMeta.textContent = "Loading...";
  subagentsTranscriptEl.textContent = "";
  subagentsBack.focus();
  try {
    const res = await fetch(`/api/subagents/${encodeURIComponent(id)}`);
    if (epoch !== subagentsEpoch) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (epoch !== subagentsEpoch) return;
    subagentsMeta.textContent = [
      body.label,
      formatSubagentBytes(body.bytes),
      formatSubagentWhen(body.modifiedAt),
    ].filter((part) => typeof part === "string" && part !== "").join(" · ");
    renderSubagentTranscript(body);
  } catch (error) {
    if (epoch !== subagentsEpoch) return;
    subagentsMeta.textContent = "Unavailable";
    subagentsTranscriptEl.textContent = `Could not load this transcript: ${error.message}`;
    subagentsBack.focus();
  }
}

subagentsBtn.addEventListener("click", openSubagents);
subagentsClose.addEventListener("click", closeSubagents);
subagentsBack.addEventListener("click", async () => {
  resetSubagentView();
  subagentsClose.focus();
  await loadSubagents();
  if (subagentsOverlay.hidden) return;
  const firstRow = subagentsListEl.querySelector(".subagent-row");
  (firstRow ?? subagentsClose).focus();
});
subagentsOverlay.addEventListener("mousedown", (event) => {
  if (event.target === subagentsOverlay) closeSubagents();
});

