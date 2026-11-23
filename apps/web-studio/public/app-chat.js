// Chat transcript rendering, tool records, diffs, models, and history.

// The build plan is a projection of the logged update_plan tool call. It is
// read-only and rendered with textContent: model output is never HTML.
const PLAN_STATUSES = ["pending", "in_progress", "completed"];
function renderPlan(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  planSteps.textContent = "";
  let completed = 0;
  for (const step of steps) {
    const title = typeof step?.title === "string" ? step.title.trim() : "";
    if (title === "") continue;
    const status = PLAN_STATUSES.includes(step?.status) ? step.status : "pending";
    if (status === "completed") completed++;
    const item = document.createElement("li");
    item.className = `plan-step ${status}`;
    item.setAttribute("aria-label", `${title} (${status.replace("_", " ")})`);
    const mark = document.createElement("span");
    mark.className = "plan-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = status === "completed" ? "✓" : "";
    const label = document.createElement("span");
    label.className = "plan-title";
    label.textContent = title;
    item.append(mark, label);
    planSteps.appendChild(item);
  }
  const total = planSteps.childElementCount;
  if (total === 0) {
    planPanel.hidden = true;
    planCount.textContent = "";
    return;
  }
  planCount.textContent = `${completed}/${total}`;
  planPanel.hidden = false;
}

// Pull code or answers out of a finished reply without selecting text.
function attachCopyButton(bubble) {
  const row = bubble.parentElement;
  if (row === null || !row.classList.contains("msg-row")) return;
  if (row.querySelector(".msg-copy") !== null) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "msg-copy";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(bubble.dataset.copyText ?? bubble.textContent);
      btn.textContent = "Copied";
      notify("Reply copied", "ok");
    } catch {
      btn.textContent = "Blocked";
      notify("Clipboard blocked by the browser", "error");
    }
    window.setTimeout(() => { btn.textContent = "Copy"; }, 1200);
  });
  row.appendChild(btn);
}

// Client-side errors must surface in-band: a silently broken UI is the
// worst failure mode a local tool can have (it is how a stuck modal went
// undiagnosed for a session).
window.addEventListener("error", (event) => {
  addMessage("system-error", `Client error: ${event.message}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "unknown");
  addMessage("system-error", `Client error: ${reason}`);
});

function childIdFromResult(result) {
  const match = /(?:^|\n)Child: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/.exec(result);
  return match?.[1] ?? null;
}

function subagentLogId(name, childId) {
  const prefix = SUBAGENT_TOOL_PREFIXES.get(name);
  if (prefix === undefined || typeof childId !== "string" || !CHILD_ID_PATTERN.test(childId)) return null;
  return `${prefix}-${childId}`;
}

function addToolLine(name, id, scroll = true) {
  const el = document.createElement("div");
  el.className = "msg tool-line";
  el.setAttribute("role", "status");
  if (typeof id === "string" && id.length > 0) el.dataset.toolId = id;
  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.innerHTML = TOOL_SVG; // static brand geometry, never user data
  const label = document.createElement("span");
  label.className = "tool-name";
  label.textContent = name;
  const summary = document.createElement("span");
  summary.className = "tool-summary";
  summary.textContent = "running…";
  el.append(icon, label, summary);
  messagesEl.appendChild(el);
  if (scroll) autoScroll();
  return el;
}

function setToolLine(line, name, ok, summary, transcriptId) {
  line.classList.toggle("failed", !ok);
  line.classList.toggle("ok", ok);
  const label = line.querySelector(".tool-name");
  if (label !== null) label.textContent = name;
  const summaryEl = line.querySelector(".tool-summary");
  if (summaryEl !== null) summaryEl.textContent = summary === "" ? (ok ? "done" : "failed") : summary;
  line.setAttribute("aria-label", `${name}, ${ok ? "completed" : "failed"}${summary === "" ? "" : `, ${summary}`}`);
  if (transcriptId === null) return;
  line.querySelector(".tool-transcript-link")?.remove();
  const link = document.createElement("button");
  link.type = "button";
  link.className = "tool-transcript-link";
  link.textContent = "View transcript";
  link.title = `Open transcript ${transcriptId}`;
  link.addEventListener("click", () => openSubagentTranscriptFromTool(transcriptId, link));
  line.append(" ", link);
}

function createToolRecord(tool) {
  const record = document.createElement("div");
  record.className = "tool-record";
  if (typeof tool.id === "string" && tool.id.length > 0) record.dataset.toolId = tool.id;

  const head = document.createElement("div");
  head.className = "tool-head";

  const icon = document.createElement("span");
  icon.className = "tool-icon";
  const iconMap = {
    list_files: "list",
    read_file: "eye",
    write_file: "write",
    design_audit: "check",
    explore_project: "compass",
    review_project: "eye",
    build_project: "hammer",
    update_plan: "list",
  };
  const svgName = iconMap[tool.name] ?? "drive";
  icon.innerHTML = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4h8M4 8h5M4 12h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const name = document.createElement("span");
  name.className = "tool-name";
  name.textContent = tool.name;

  const status = document.createElement("span");
  status.className = "tool-status";
  status.textContent = tool.phase === "start" ? "running" : tool.ok ? "done" : "failed";
  head.append(icon, name, status);

  const body = document.createElement("div");
  body.className = "tool-body";

  if (tool.phase === "start" && tool.arguments) {
    const args = document.createElement("pre");
    args.className = "tool-args";
    args.textContent = "arguments: " + tool.arguments;
    body.appendChild(args);
  }

  record.appendChild(head);
  record.appendChild(body);
  return record;
}

function setToolRecord(record, tool) {
  const head = record.querySelector(".tool-head");
  if (head === null) return;
  const name = head.querySelector(".tool-name");
  if (name !== null) name.textContent = tool.name;

  const status = head.querySelector(".tool-status");
  if (status !== null) {
    status.textContent = tool.ok ? "done" : "failed";
    status.dataset.status = tool.ok ? "done" : "failed";
    status.style.background = tool.ok ? "var(--success)" : "var(--danger)";
  }

}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function diffLines(oldContent, newContent) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const result = [];
  let i = 0;
  let j = 0;
  let hunkHeader = null;
  let hunkLines = [];

  const flushHunk = () => {
    if (hunkHeader !== null) {
      result.push(`<div class="diff-hunk">@@ ${escapeHtml(hunkHeader)} @@</div>`);
      for (const line of hunkLines) {
        const cls = line.startsWith("+") ? "new" : line.startsWith("-") ? "old" : "context";
        result.push(`<span class="diff-line ${cls}">${escapeHtml(line)}</span>`);
      }
    }
    hunkHeader = null;
    hunkLines = [];
  };

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = j < newLines.length ? newLines[j] : null;

    if (oldLine === null || newLine === null || oldLine !== newLine) {
      if (hunkHeader === null) {
        hunkHeader = `${i + 1},${oldLines.length - i} ${j + 1},${newLines.length - j}`;
      }
      if (newLine !== null) hunkLines.push(newLine);
      i++;
      j++;
    } else {
      flushHunk();
      result.push(`<span class="diff-line context">${escapeHtml(oldLine)}</span>`);
      i++;
      j++;
    }
  }
  flushHunk();
  return result.join("");
}

function renderDiffs(parent, patches) {
  for (const patch of patches) {
    const diff = document.createElement("div");
    diff.className = "diff-view";

    const head = document.createElement("div");
    head.className = "diff-head";

    const title = document.createElement("span");
    title.className = "diff-title";
    title.textContent = patch.path;

    const status = document.createElement("span");
    status.className = "diff-status";
    status.dataset.status = patch.status;
    status.textContent = patch.status === "deleted" ? "deleted" : patch.status === "created" ? "created" : "updated";

    head.append(title, status);
    diff.appendChild(head);

    const body = document.createElement("div");
    body.className = "diff-body";
    body.setAttribute("role", "region");
    body.setAttribute("aria-label", `Changes to ${patch.path}`);

    if (patch.status === "updated" && patch.oldContent !== null && patch.newContent !== null) {
      body.innerHTML = diffLines(patch.oldContent, patch.newContent); // canon-ignore A8-SEC-08: diffLines escapes every interpolated value.
    } else {
      body.textContent = patch.newContent ?? "(no detail)";
    }
    diff.appendChild(body);
    parent.appendChild(diff);
  }
}

function updateToolsVisibility() {
  const toolsEl = document.getElementById("tools");
  if (toolsEl === null) return;
  const hasContent = toolsEl.children.length > 0;
  toolsEl.hidden = !hasContent;
}

async function loadModels() {
  const key = apiKey();
  modelSelect.disabled = true;
  syncChatControls();
  try {
    // Zero-key browsing: the catalog is public data. A key only upgrades the
    // request to the entitlement-aware path.
    const headers = key.length > 0 ? { "X-OpenRouter-Key": key } : {};
    const res = await fetch("/api/models", { headers });
    if (!res.ok) throw new Error((await res.json()).error ?? "model discovery failed");
    const body = await res.json();
    modelSelect.innerHTML = "";
    for (const model of body.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = `${model.name} (${Math.round((model.contextLength ?? 0) / 1000)}k)`;
      option.dataset.context = String(model.contextLength ?? 0);
      option.dataset.name = model.name;
      modelSelect.appendChild(option);
    }
    if (body.models.length === 0) {
      modelSelect.innerHTML = "<option>no free tool-capable models found</option>";
    } else {
      modelSelect.disabled = false;
      if (body.models.some((model) => model.id === "openrouter/free")) {
        modelSelect.value = "openrouter/free";
      }
      syncModelInfo();
    }
  } catch (error) {
    modelSelect.innerHTML = "<option>discovery failed</option>";
    addMessage("system-error", `Model discovery: ${error.message}`);
  } finally {
    syncChatControls();
  }
}

function syncModelInfo() {
  const note = document.getElementById("model-note");
  if (note === null) return;
  const option = modelSelect.selectedOptions[0];
  if (option === undefined || modelSelect.disabled) {
    note.textContent = "Free models";
    return;
  }
  const context = Number(option.dataset.context ?? "0");
  note.textContent = context > 0
    ? `Free · ${Math.round(context / 1000)}k context`
    : "Free · tool capable";
}

keyInput.addEventListener("change", loadModels);
modelSelect.addEventListener("change", syncModelInfo);
// Browse immediately on load, with no key anywhere in the flow.
void loadModels();

// The conversation is derived from the sandbox's durable session log, so a
// refresh or a studio restart does not erase the build. The epoch guard keeps
// a slow restore from repainting over a new chat or a freshly sent message.
let historyEpoch = 0;
async function restoreHistory() {
  const epoch = ++historyEpoch;
  try {
    const res = await fetch("/api/history");
    if (!res.ok) return;
    const body = await res.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const toolResults = new Map();
    for (const message of messages) {
      if (typeof message !== "object" || message === null) continue;
      if (message.role !== "tool") continue;
      if (typeof message.toolCallId !== "string" || typeof message.content !== "string") continue;
      toolResults.set(message.toolCallId, {
        content: message.content,
        childId: typeof message.childId === "string" ? message.childId : null,
      });
    }
    if (epoch !== historyEpoch) return;
    renderPlan(body.plan ?? null);

    let rendered = 0;
    for (const message of messages) {
      if (typeof message !== "object" || message === null) continue;
      if (message.role !== "user" && message.role !== "assistant") continue;
      if (typeof message.content !== "string") continue;
      if (message.content.length > 0) {
        const bubble = addMessage(message.role, message.content);
        if (message.role === "assistant") {
          formatAssistantMessage(bubble);
          attachCopyButton(bubble);
        }
        rendered++;
      }
      if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) continue;
      for (const call of message.toolCalls) {
        if (typeof call !== "object" || call === null) continue;
        if (typeof call.name !== "string" || !SUBAGENT_TOOL_PREFIXES.has(call.name)) continue;
        const line = addToolLine(call.name, typeof call.id === "string" ? call.id : "", false);
        const result = typeof call.id === "string" ? toolResults.get(call.id) : undefined;
        if (result !== undefined) {
          const childId = result.childId ?? childIdFromResult(result.content);
          setToolLine(
            line,
            call.name,
            !result.content.startsWith("Error:"),
            result.content.split("\n")[0] ?? "",
            subagentLogId(call.name, childId),
          );
        }
        rendered++;
      }
    }
    if (epoch !== historyEpoch) return;
    if (rendered === 0) return;
    autoScroll();
  } catch {
    // History is an enhancement: a failed read must never block the composer.
  }
}
void restoreHistory();

