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

// Message actions: copy/regenerate. Real actions only, no fake controls.
function attachAssistantActions(bubble, options = {}) {
  const row = bubble.parentElement;
  if (row === null || !row.classList.contains("msg-row")) return;
  if (row.querySelector(".msg-actions") !== null) return;
  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const copyIcon = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.2" y="5.2" width="7.2" height="8.4" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.6 2.8H4.8A1.4 1.4 0 0 0 3.4 4.2v7.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const checkIcon = '<svg class="icon icon-check-swap" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.2 6.7 11.4 12.7 5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "msg-action";
  copy.dataset.action = "copy";
  copy.innerHTML = copyIcon + "<span>Copy</span>"; // canon-ignore A8-SEC-08: static trusted markup, never user data
  copy.addEventListener("click", async () => {
    copy.classList.remove("is-confirming");
    try {
      await navigator.clipboard.writeText(bubble.dataset.copyText ?? bubble.textContent);
      copy.innerHTML = checkIcon + "<span>Copied</span>"; // canon-ignore A8-SEC-08: static trusted markup, never user data
      copy.classList.add("is-confirming");
      notify("Reply copied", "ok");
    } catch {
      copy.innerHTML = copyIcon + "<span>Blocked</span>"; // canon-ignore A8-SEC-08: static trusted markup, never user data
      notify("Clipboard blocked by the browser", "error");
    }
    window.setTimeout(() => { copy.innerHTML = copyIcon + "<span>Copy</span>"; copy.classList.remove("is-confirming"); }, 1500); // canon-ignore A8-SEC-08: static trusted markup, never user data
  });
  actions.appendChild(copy);

  if (options.regenerate === true) {
    for (const old of messagesEl.querySelectorAll('.msg-action[data-action="regenerate"]')) old.remove();
    const regen = document.createElement("button");
    regen.type = "button";
    regen.className = "msg-action";
    regen.dataset.action = "regenerate";
    regen.textContent = "Regenerate";
    regen.disabled = chatRunning;
    regen.addEventListener("click", () => {
      if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
    });
    actions.appendChild(regen);
  }

  row.appendChild(actions);
}

function attachUserActions(bubble) {
  const row = bubble.parentElement;
  if (row === null || !row.classList.contains("msg-row")) return;
  if (row.querySelector(".msg-actions") !== null) return;
  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const copyIcon = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.2" y="5.2" width="7.2" height="8.4" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.6 2.8H4.8A1.4 1.4 0 0 0 3.4 4.2v7.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const checkIcon = '<svg class="icon icon-check-swap" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.2 6.7 11.4 12.7 5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "msg-action";
  copy.dataset.action = "copy";
  copy.innerHTML = copyIcon + "<span>Copy</span>"; // canon-ignore A8-SEC-08: static trusted markup, never user data
  copy.addEventListener("click", async () => {
    copy.classList.remove("is-confirming");
    try {
      await navigator.clipboard.writeText(bubble.textContent ?? "");
      copy.innerHTML = checkIcon + "<span>Copied</span>"; // canon-ignore A8-SEC-08: static trusted markup, never user data
      copy.classList.add("is-confirming");
      notify("Reply copied", "ok");
    } catch {
      copy.innerHTML = copyIcon + "<span>Blocked</span>"; // canon-ignore A8-SEC-08: static trusted markup, never user data
      notify("Clipboard blocked by the browser", "error");
    }
    window.setTimeout(() => { copy.innerHTML = copyIcon + "<span>Copy</span>"; copy.classList.remove("is-confirming"); }, 1500); // canon-ignore A8-SEC-08: static trusted markup, never user data
  });
  actions.appendChild(copy);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "msg-action";
  edit.dataset.action = "edit";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => {
    if (chatRunning) return;
    promptEl.value = bubble.textContent ?? "";
    promptEl.style.height = "auto";
    promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
    promptEl.focus();
    saveDraft();
  });
  actions.appendChild(edit);

  row.appendChild(actions);
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
  icon.innerHTML = TOOL_SVG; // canon-ignore A8-SEC-08: static brand geometry, never user data
  const label = document.createElement("span");
  label.className = "tool-name";
  label.textContent = name;
  const summary = document.createElement("span");
  summary.className = "tool-summary";
  summary.textContent = "running…";
  el.append(icon, label, summary);
  if (!window.STUDIO_EXECUTION_TIMELINE) {
    messagesEl.appendChild(el);
    if (scroll) autoScroll();
  }
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

function compactToolArgs(tool) {
  const raw = typeof tool.arguments === "string" ? tool.arguments : "";
  if (raw.length === 0) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (tool.name === "write_file" && typeof parsed.path === "string") {
        const size = typeof parsed.content === "string" ? parsed.content.length : 0;
        return `${parsed.path} (${size} chars)`;
      }
      if (typeof parsed.path === "string" && Object.keys(parsed).length === 1) return parsed.path;
      if (typeof parsed.path === "string") return parsed.path;
      const keys = Object.keys(parsed).slice(0, 3);
      if (keys.length > 0) return keys.map((k) => `${k}=${String(parsed[k]).slice(0, 40)}`).join(" ");
    }
  } catch (error) {
    void error; // fall through to truncation
  }
  return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
}

function toolIconSvg(status) {
  if (status === "running") return '<svg class="icon tool-spin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="20 12" stroke-linecap="round"/><circle class="tool-dot" cx="8" cy="8" r="2.6"/></svg>';
  if (status === "done") return '<svg class="icon tool-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.2 6.7 11.4 12.7 5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return '<svg class="icon tool-fail" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5l6 6M11 5 5 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function createToolRecord(tool) {
  const record = document.createElement("div");
  record.className = "tool-record";
  record.style.willChange = "opacity, transform";
  if (typeof tool.id === "string" && tool.id.length > 0) record.dataset.toolId = tool.id;

  const head = document.createElement("div");
  head.className = "tool-head";

  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.style.willChange = "transform";
  const statusValue = tool.phase === "start" ? "running" : tool.ok ? "done" : "failed";
  icon.innerHTML = toolIconSvg(statusValue); // canon-ignore A8-SEC-08: static trusted SVG from local constant, never user data
  if (statusValue === "running") icon.dataset.status = "running";

  const name = document.createElement("span");
  name.className = "tool-name";
  name.textContent = tool.name;

  const status = document.createElement("span");
  status.className = "tool-status";
  status.textContent = statusValue;
  status.dataset.status = statusValue;
  head.append(icon, name, status);

  const body = document.createElement("div");
  body.className = "tool-body";
  const compact = compactToolArgs(tool);
  if (compact) {
    const args = document.createElement("div");
    args.className = "tool-args";
    args.textContent = compact;
    body.appendChild(args);
  } else {
    body.hidden = true;
  }

  record.append(head, body);
  return record;
}

function setToolRecord(record, tool) {
  const head = record.querySelector(".tool-head");
  if (head === null) return;
  const name = head.querySelector(".tool-name");
  if (name !== null) name.textContent = tool.name;

  const nextStatus = tool.ok ? "done" : "failed";
  const icon = head.querySelector(".tool-icon");
  if (icon !== null) {
    icon.style.willChange = "transform";
    icon.innerHTML = toolIconSvg(nextStatus); // canon-ignore A8-SEC-08: static trusted SVG from local constant, never user data
    const svg = icon.querySelector(".icon");
    if (svg) {
      svg.classList.remove("status-pop");
      void svg.getBoundingClientRect();
      svg.classList.add("status-pop");
    }
  }
  const iconStatus = head.querySelector(".tool-icon");
  if (iconStatus) {
    if (nextStatus === "running") iconStatus.dataset.status = "running";
    else iconStatus.dataset.status = "";
  }
  const status = head.querySelector(".tool-status");
  if (status !== null) {
    status.style.willChange = "opacity, transform";
    status.textContent = nextStatus;
    status.dataset.status = nextStatus;
    status.classList.remove("status-pop");
    // force reflow to restart animation on rapid updates
    void status.offsetWidth;
    status.classList.add("status-pop");
    status.style.willChange = "";
  }

  const body = record.querySelector(".tool-body");
  if (body === null) return;
  body.hidden = false;
  const existingSummary = body.querySelector(".tool-result");
  if (existingSummary) existingSummary.remove();
  if (typeof tool.summary === "string" && tool.summary.length > 0) {
    const summary = document.createElement("div");
    summary.className = "tool-result";
    summary.dataset.status = tool.ok ? "done" : "failed";
    summary.textContent = tool.summary;
    body.appendChild(summary);
  }
  if (!body.childElementCount) body.hidden = true;
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
function collectHistoryToolResults(messages) {
  const toolResults = new Map();
  for (const message of messages) {
    if (message?.role !== "tool" || typeof message.toolCallId !== "string" || typeof message.content !== "string") continue;
    toolResults.set(message.toolCallId, { content: message.content, childId: typeof message.childId === "string" ? message.childId : null });
  }
  return toolResults;
}

function buildHistoryExecutionEvents(messages, toolResults) {
  const events = [];
  let seq = 0;
  let currentTurnId = "hist_turn_0";
  const ts = () => new Date().toISOString();
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    if (message.role === "user" && typeof message.content === "string") {
      currentTurnId = `hist_turn_${++seq}`;
      events.push({ v:1, id:`hist_u_${seq}`, seq, ts:ts(), sessionId:activeSessionId, turnId:currentTurnId, source:"system", kind:"user.message", activityId:`hist_user_${seq}`, state:"completed", payload:{ text: message.content } });
    }
    if (message.role !== "assistant") continue;
    if (typeof message.content === "string" && message.content.trim().length > 0) {
      const aid = `hist_assistant_${++seq}`;
      events.push({ v:1, id:`hist_ad_${seq}`, seq, ts:ts(), sessionId:activeSessionId, turnId:currentTurnId, source:"chat", kind:"assistant.message.delta", activityId:aid, state:"completed", payload:{ text: message.content } });
      events.push({ v:1, id:`hist_ac_${seq}`, seq:seq+0.1, ts:ts(), sessionId:activeSessionId, turnId:currentTurnId, source:"chat", kind:"assistant.message.completed", activityId:aid, state:"completed", payload:{} });
    }
    if (!Array.isArray(message.toolCalls)) continue;
    for (const call of message.toolCalls) {
      if (call?.name === undefined) continue;
      const tid = typeof call.id === "string" ? call.id : `hist_tool_${++seq}`;
      const result = typeof call.id === "string" ? toolResults.get(call.id) : undefined;
      const ok = !!(result && !String(result.content).startsWith("Error:"));
      events.push({ v:1, id:`hist_ts_${++seq}`, seq, ts:ts(), sessionId:activeSessionId, turnId:currentTurnId, source:"chat", kind:"tool.started", activityId:tid, state:"running", payload:{ name: call.name, arguments: typeof call.arguments === "string" ? call.arguments : "" } });
      events.push({ v:1, id:`hist_td_${++seq}`, seq, ts:ts(), sessionId:activeSessionId, turnId:currentTurnId, source:"chat", kind: ok ? "tool.completed" : "tool.failed", activityId:tid, state: ok ? "completed" : "failed", payload:{ name: call.name, summary: result ? String(result.content).split("\n")[0] : "", ok } });
    }
  }
  return events;
}

function appendHistoryRegenerateAction(bubble) {
  const actions = bubble?.parentElement?.querySelector(".msg-actions");
  if (!actions || actions.querySelector('[data-action="regenerate"]')) return;
  const regen = document.createElement("button");
  regen.type = "button"; regen.className = "msg-action"; regen.dataset.action = "regenerate"; regen.textContent = "Regenerate"; regen.disabled = chatRunning;
  regen.addEventListener("click", () => { if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse(); });
  actions.appendChild(regen);
}

function renderHistoryMessages(messages, toolResults, epoch) {
  let rendered = 0;
  let lastAssistantBubble = null;
  for (const message of messages) {
    if (message?.role !== "user" && message?.role !== "assistant") continue;
    if (typeof message.content === "string" && message.content.length > 0) {
      const bubble = addMessage(message.role, message.content);
      if (message.role === "assistant") {
        formatAssistantMessage(bubble);
        if (bubble.textContent.trim().length === 0) { bubble.parentElement?.remove(); }
        else { attachAssistantActions(bubble, { regenerate: false }); lastAssistantBubble = bubble; rendered++; }
      } else rendered++;
    }
    if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) continue;
    for (const call of message.toolCalls) {
      if (typeof call?.name !== "string" || !SUBAGENT_TOOL_PREFIXES.has(call.name)) continue;
      const line = addToolLine(call.name, typeof call.id === "string" ? call.id : "", false);
      const result = typeof call.id === "string" ? toolResults.get(call.id) : undefined;
      if (result !== undefined) setToolLine(line, call.name, !result.content.startsWith("Error:"), result.content.split("\n")[0] ?? "", subagentLogId(call.name, result.childId ?? childIdFromResult(result.content)));
      rendered++;
    }
  }
  if (epoch !== historyEpoch) return 0;
  if (lastAssistantBubble !== null) appendHistoryRegenerateAction(lastAssistantBubble);
  return rendered;
}

async function restoreHistory() {
  const epoch = ++historyEpoch;
  try {
    const res = await fetch("/api/history");
    if (!res.ok) return;
    const body = await res.json();
    if (epoch !== historyEpoch) return;
    if (typeof body.sessionId === "string" && body.sessionId.length > 0 && body.sessionId !== activeSessionId) {
      activeSessionId = body.sessionId;
      if (typeof window.refreshSessionList === "function") void window.refreshSessionList();
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const toolResults = collectHistoryToolResults(messages);
    if (messages.length > 0) hideWelcome();
    renderPlan(body.plan ?? null);
    if (typeof executionStore !== "undefined") { executionStore.reset(); executionStore.applyEvents(buildHistoryExecutionEvents(messages, toolResults)); }
    if (window.STUDIO_EXECUTION_TIMELINE) { requestAnimationFrame(() => scrollToLatest("auto")); return; }
    messagesEl.classList.add("restoring");
    try {
      if (renderHistoryMessages(messages, toolResults, epoch) > 0) scrollToLatest("auto");
    } finally {
      messagesEl.classList.remove("restoring");
    }
  } catch (error) {
    void error; // History is an enhancement: a failed read must never block the composer.
  }
}
void restoreHistory();

