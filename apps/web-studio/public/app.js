/* Authenik8 client (v1): BYOK key in memory only; SSE agent loop with sandboxed file tools. */

const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const composer = document.getElementById("composer");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("new-chat");
const usageLine = document.getElementById("usage-line");
const planPanel = document.getElementById("plan-panel");
const planSteps = document.getElementById("plan-steps");
const planCount = document.getElementById("plan-count");
const subagentsOverlay = document.getElementById("subagents-overlay");
const SUBAGENT_TOOL_PREFIXES = new Map([
  ["explore_project", "explore"],
  ["review_project", "review"],
  ["build_project", "build"],
]);
const CHILD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function apiKey() {
  return keyInput.value.trim();
}

function nearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 96;
}

function autoScroll(force = false) {
  // New messages should land in view. Streaming text only follows the bottom
  // when the reader is already there, so scrolling up is never yanked away.
  if (force || nearBottom()) messagesEl.scrollTop = messagesEl.scrollHeight;
}

const MODAL_FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const modalInertSiblings = new Map();

function modalFocusableElements(modal) {
  return [...modal.querySelectorAll(MODAL_FOCUSABLE)].filter((element) => {
    if (element.closest("[hidden]")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (element.tabIndex < 0) return false;
    return element.getClientRects().length > 0;
  });
}

function focusModalFirst(modal, fallback) {
  const first = modalFocusableElements(modal)[0];
  (first ?? fallback).focus();
}

function modalOpener(fallback) {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : fallback;
}

function restoreModalFocus(opener, fallback) {
  if (opener instanceof HTMLElement && opener.isConnected && opener.getClientRects().length > 0) {
    opener.focus();
    return;
  }
  fallback.focus();
}

function setModalBackgroundInert(overlay, inert) {
  const shell = overlay.parentElement;
  if (shell === null) return;
  if (inert) {
    if (modalInertSiblings.has(overlay)) return;
    const siblings = [...shell.children]
      .filter((element) => element !== overlay)
      .map((element) => ({ element, wasInert: element.inert }));
    modalInertSiblings.set(overlay, siblings);
    for (const { element } of siblings) element.inert = true;
    return;
  }
  const siblings = modalInertSiblings.get(overlay);
  if (siblings === undefined) return;
  for (const { element, wasInert } of siblings) element.inert = wasInert;
  modalInertSiblings.delete(overlay);
}

function trapModalTab(event, overlay, modal, fallback) {
  if (event.key !== "Tab" || overlay.hidden) return;
  const focusable = modalFocusableElements(modal);
  if (focusable.length === 0) {
    event.preventDefault();
    fallback.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = active !== null && modal.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

// The compact brand mark for assistant avatars: the real logo geometry,
// trimmed of the dot grid and glow that only read at large sizes.
const AVATAR_SVG = '<svg class="avatar" width="26" height="26" viewBox="0 0 680 680" aria-hidden="true"><circle cx="340" cy="340" r="240" fill="#246a43"/><circle cx="340" cy="340" r="240" fill="none" stroke="#39c978" stroke-width="34"/><polygon points="226 490 262 490 342 260 322 260" fill="#f7fff9"/><polygon points="356 260 336 260 418 490 454 490" fill="#f7fff9"/><rect x="270" y="388" width="98" height="32" rx="5" fill="#f7fff9"/><rect x="360" y="262" width="92" height="96" rx="36" fill="#a7dfbf"/><rect x="354" y="362" width="102" height="112" rx="42" fill="#a7dfbf"/><rect x="358" y="349" width="94" height="22" rx="5" fill="#a7dfbf"/></svg>';

function addMessage(kind, text) {
  welcomeEl.hidden = true; // any message replaces the empty state
  if (kind === "assistant") {
    const row = document.createElement("div");
    row.className = "msg-row assistant-row";
    row.innerHTML = AVATAR_SVG; // static brand markup, never user data
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.textContent = text;
    row.appendChild(el);
    messagesEl.appendChild(row);
    autoScroll(true);
    return el;
  }
  if (kind === "user") {
    // The row carries the centered column width; the bubble itself must not
    // inherit the `.msg` auto margins or it lands in the middle of the column.
    const row = document.createElement("div");
    row.className = "msg-row user";
    const el = document.createElement("div");
    el.className = "msg user";
    el.textContent = text;
    row.appendChild(el);
    messagesEl.appendChild(row);
    autoScroll(true);
    return el;
  }
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  autoScroll();
  return el;
}

function showWelcome() {
  messagesEl.innerHTML = "";
  renderPlan(null);
  welcomeEl.hidden = false;
}

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
      await navigator.clipboard.writeText(bubble.textContent);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Blocked";
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
  if (typeof id === "string" && id.length > 0) el.dataset.toolId = id;
  el.textContent = `⚙ ${name} …`;
  messagesEl.appendChild(el);
  if (scroll) autoScroll();
  return el;
}

function setToolLine(line, name, ok, summary, transcriptId) {
  line.textContent = `⚙ ${name} ${ok ? "✓" : "✗"} ${summary}`;
  if (transcriptId === null) return;
  const link = document.createElement("button");
  link.type = "button";
  link.className = "tool-transcript-link";
  link.textContent = "View transcript";
  link.title = `Open transcript ${transcriptId}`;
  link.addEventListener("click", () => openSubagentTranscriptFromTool(transcriptId, link));
  line.append(" ", link);
}

async function loadModels() {
  const key = apiKey();
  modelSelect.disabled = true;
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
      modelSelect.appendChild(option);
    }
    if (body.models.length === 0) {
      modelSelect.innerHTML = "<option>no free tool-capable models found</option>";
    } else {
      modelSelect.disabled = false;
      sendBtn.disabled = false;
      const note = document.getElementById("model-note");
      if (note !== null) note.textContent = `${body.models.length} free · no key to browse`;
      // Default to the auto-router when present: some free models behind
      // agents-only providers 403 app traffic — a broken zero-click default
      // must never be the entry experience.
      if (body.models.some((model) => model.id === "openrouter/free")) {
        modelSelect.value = "openrouter/free";
      }
    }
  } catch (error) {
    modelSelect.innerHTML = "<option>discovery failed</option>";
    addMessage("system-error", `Model discovery: ${error.message}`);
  }
}

keyInput.addEventListener("change", loadModels);
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
        if (message.role === "assistant") attachCopyButton(bubble);
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

const previewPane = document.getElementById("preview-pane");
const previewFrame = document.getElementById("preview-frame");

function showPreview() {
  previewPane.classList.add("open");
  previewPane.setAttribute("aria-hidden", "false");
  previewFrame.src = `/preview/?t=${Date.now()}`;
}

function hidePreview() {
  previewPane.classList.remove("open");
  previewPane.setAttribute("aria-hidden", "true");
  previewFrame.src = "about:blank";
}

document.getElementById("preview-btn").addEventListener("click", () => {
  if (previewPane.classList.contains("open")) hidePreview();
  else showPreview();
});

document.getElementById("preview-reload").addEventListener("click", showPreview);
document.getElementById("preview-close").addEventListener("click", hidePreview);

// --- Build with agent (user-triggered only) ---

const agentOverlay = document.getElementById("agent-overlay");
const agentModal = agentOverlay.querySelector(".agent-modal");
const agentBtn = document.getElementById("agent-btn");
const agentClose = document.getElementById("agent-close");
const agentDismiss = document.getElementById("agent-dismiss");
const agentBrief = document.getElementById("agent-brief");
const agentForm = document.getElementById("agent-form");
const agentStatus = document.getElementById("agent-status");
const agentState = document.getElementById("agent-state");
const agentOutput = document.getElementById("agent-output");
const agentRunBtn = document.getElementById("agent-run");
let agentRunning = false;
let agentOpener = null;

function openAgent(opener) {
  if (!agentOverlay.hidden) {
    if (agentRunning) agentDismiss.focus();
    else agentBrief.focus();
    return;
  }
  agentOpener = opener instanceof HTMLElement ? opener : modalOpener(agentBtn);
  agentOverlay.hidden = false;
  setModalBackgroundInert(agentOverlay, true);
  if (agentRunning) {
    agentForm.hidden = true;
    agentStatus.hidden = false;
    agentDismiss.focus();
    return;
  }
  agentForm.hidden = false;
  agentStatus.hidden = true;
  agentBrief.focus();
}

function closeAgent() {
  // Closing the dialog is ALWAYS allowed: it never aborts the run (closing
  // the page does), and a stuck busy-flag must never trap the user.
  if (agentOverlay.hidden) return;
  agentOverlay.hidden = true;
  setModalBackgroundInert(agentOverlay, false);
  const opener = agentOpener;
  agentOpener = null;
  restoreModalFocus(opener, agentBtn);
}

agentBtn.addEventListener("click", openAgent);
agentClose.addEventListener("click", closeAgent);
agentDismiss.addEventListener("click", closeAgent);

// The modal must be dismissible in every conventional way: clicking the
// backdrop outside the dialog, and Escape (agent first, then run panel).
agentOverlay.addEventListener("mousedown", (event) => {
  if (event.target === agentOverlay) closeAgent();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!agentOverlay.hidden) {
    closeAgent();
    return;
  }
  if (!templateOverlay.hidden) {
    closeTemplate();
    return;
  }
  if (!subagentsOverlay.hidden) {
    closeSubagents();
    return;
  }
  const runOverlay = document.getElementById("run-overlay");
  if (!runOverlay.hidden) runOverlay.hidden = true;
});

// Live agent events land here: plain text, capped at the last 300 lines
// with an ellipsis marker when older lines are trimmed away.
const MAX_AGENT_LINES = 300;

function appendAgentLine(line) {
  const lines = agentOutput.textContent === "" ? [] : agentOutput.textContent.split("\n");
  lines.push(line);
  const trimmed = lines.slice(-MAX_AGENT_LINES);
  agentOutput.textContent = (lines.length > MAX_AGENT_LINES ? "…\n" : "") + trimmed.join("\n");
  agentOutput.scrollTop = agentOutput.scrollHeight;
}

agentRunBtn.addEventListener("click", async () => {
  const brief = agentBrief.value.trim();
  if (brief.length === 0 || agentRunning) return;
  agentRunning = true;
  agentRunBtn.disabled = true;
  agentForm.hidden = true;
  agentStatus.hidden = false;
  if (!agentOverlay.hidden) agentDismiss.focus();
  agentState.textContent = "Agent running, this can take minutes…";
  agentOutput.textContent = "";

  try {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" }, // no key: the agent never uses it
      body: JSON.stringify({ prompt: brief }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneEvent = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.agent?.phase === "done") doneEvent = payload.agent;
          // Agent output is untrusted data: rendered as plain text only.
          if (payload.agent?.outputTail) agentOutput.textContent += payload.agent.outputTail;
          if (payload.agent?.errorTail) agentOutput.textContent += payload.agent.errorTail;
          // Live runtime events: untrusted third-party NDJSON, one compact
          // line each, capped so a chatty run cannot flood the modal.
          if (payload.agentEvent !== undefined) {
            const text = JSON.stringify(payload.agentEvent.data) ?? "";
            appendAgentLine(text.length > 2000 ? `${text.slice(0, 2000)}…` : text);
          }
        }
      }
    }

    if (doneEvent !== null) {
      agentState.textContent = doneEvent.ok
        ? `Agent finished in ${(doneEvent.durationMs / 1000).toFixed(0)}s. Hit Preview to see the result.`
        : doneEvent.errorCode === "runtime_missing"
          ? "Agent failed: no spawnable opencode CLI found. Install it with `npm install -g @opencode/cli` (or set OPENCODE_PATH), then reload this page."
          : `Agent failed: ${doneEvent.errorCode ?? "unknown"}. Output below.`;
    }
  } catch (error) {
    agentState.textContent = `Agent error: ${error.message}`;
  } finally {
    agentRunning = false;
    agentRunBtn.disabled = false;
    showPreview(); // refresh the preview pane with whatever the agent built
  }
});

// --- New from template (the Authenik8 CLI bridge) ---

const templateOverlay = document.getElementById("template-overlay");
const templateModal = templateOverlay.querySelector(".agent-modal");
const templateBtn = document.getElementById("template-btn");
const templateClose = document.getElementById("template-close");
const templateDismiss = document.getElementById("template-dismiss");
const templatePreset = document.getElementById("template-preset");
const templateForm = document.getElementById("template-form");
const templateStatus = document.getElementById("template-status");
const templateState = document.getElementById("template-state");
const templateOutput = document.getElementById("template-output");
const templateRunBtn = document.getElementById("template-run");
let templateBusy = false;
let templateOpener = null;

const MAX_TEMPLATE_LINES = 300;
function appendTemplateLine(line) {
  const lines = templateOutput.textContent === "" ? [] : templateOutput.textContent.split("\n");
  if (lines[0] === "…") lines.shift();
  lines.push(line);
  if (lines.length > MAX_TEMPLATE_LINES) {
    lines.splice(0, lines.length - MAX_TEMPLATE_LINES);
    lines.unshift("…");
  }
  templateOutput.textContent = lines.join("\n");
  templateOutput.scrollTop = templateOutput.scrollHeight;
}

function syncTemplateRows() {
  const preset = templatePreset.value;
  document.getElementById("template-frontend-row").hidden = preset !== "fullstack";
  document.getElementById("template-providers-row").hidden = preset !== "auth-oauth";
  if (preset === "fullstack") {
    // The CLI's own contract: fullstack requires PostgreSQL.
    document.getElementById("template-database").value = "postgresql";
  }
}
templatePreset.addEventListener("change", syncTemplateRows);

function openTemplate(opener) {
  if (!templateOverlay.hidden) {
    if (templateBusy) templateDismiss.focus();
    else templatePreset.focus();
    return;
  }
  templateOpener = opener instanceof HTMLElement ? opener : modalOpener(templateBtn);
  templateOverlay.hidden = false;
  setModalBackgroundInert(templateOverlay, true);
  if (templateBusy) {
    templateForm.hidden = true;
    templateStatus.hidden = false;
    templateDismiss.focus();
    return;
  }
  templateForm.hidden = false;
  templateStatus.hidden = true;
  syncTemplateRows();
  templatePreset.focus();
}

function closeTemplate() {
  // Always allowed: hiding the dialog never cancels the generation, and a
  // stuck busy-flag must never trap the user.
  if (templateOverlay.hidden) return;
  templateOverlay.hidden = true;
  setModalBackgroundInert(templateOverlay, false);
  const opener = templateOpener;
  templateOpener = null;
  restoreModalFocus(opener, templateBtn);
}

templateBtn.addEventListener("click", openTemplate);

// Starter prompts on the empty state: two fill the composer, two open the
// real doors (the template wizard and the agent) in one click.
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (chip.dataset.open === "template") { openTemplate(chip); return; }
    if (chip.dataset.open === "agent") { openAgent(chip); return; }
    promptEl.value = chip.dataset.prompt ?? "";
    promptEl.style.height = "auto";
    promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
    promptEl.focus();
  });
});
templateClose.addEventListener("click", closeTemplate);
templateDismiss.addEventListener("click", closeTemplate);
templateOverlay.addEventListener("mousedown", (event) => {
  if (event.target === templateOverlay) closeTemplate();
});

templateRunBtn.addEventListener("click", async () => {
  if (templateBusy) return;
  const preset = templatePreset.value;
  const spec = {
    preset,
    database: document.getElementById("template-database").value,
    packageManager: document.getElementById("template-package-manager").value,
    usePrisma: document.getElementById("template-prisma").checked,
    confirm: true, // the modal itself is the explicit replacement warning
  };
  if (preset === "fullstack") spec.frontend = document.getElementById("template-frontend").value;
  if (preset === "auth-oauth") {
    const providers = [];
    if (document.getElementById("template-oauth-google").checked) providers.push("google");
    if (document.getElementById("template-oauth-github").checked) providers.push("github");
    spec.oauthProviders = providers;
  }

  templateBusy = true;
  templateRunBtn.disabled = true;
  templateForm.hidden = true;
  templateStatus.hidden = false;
  if (!templateOverlay.hidden) templateDismiss.focus();
  templateState.textContent = "Generating with the Authenik8 CLI. Runs locally, nothing is uploaded…";
  templateOutput.textContent = "";

  try {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const body = await res.json();
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let seeded = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine === undefined) continue;
        const payload = JSON.parse(dataLine.slice(6));
        if (payload.template !== undefined) {
          const t = payload.template;
          if (t.phase === "line") appendTemplateLine(t.line);
          if (t.phase === "seeded") seeded = t;
        }
        if (payload.error !== undefined) throw new Error(payload.error);
        if (payload.done === true && seeded !== null) {
          historyEpoch++;
          messagesEl.innerHTML = "";
          renderPlan(null);
          addMessage(
            "assistant",
            `Sandbox seeded from the Authenik8 template (${seeded.files} files). Describe changes in chat, or hit Run project to install and start it.`,
          );
          closeTemplate();
        }
      }
    }
    if (seeded === null && templateState.textContent !== "") {
      // Stream ended without seeded/error: the server closed early.
      throw new Error("Template stream ended before seeding completed.");
    }
  } catch (error) {
    templateState.textContent = `Template failed: ${error.message}`;
  } finally {
    if (templateState.textContent.startsWith("Template failed") || templateState.textContent === "") {
      templateState.textContent = templateState.textContent; // keep error visible
    } else {
      templateState.textContent = "Seeded.";
    }
    templateBusy = false;
    templateRunBtn.disabled = false;
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
  if (!agentOverlay.hidden) {
    trapModalTab(event, agentOverlay, agentModal, agentClose);
    return;
  }
  if (!templateOverlay.hidden) {
    trapModalTab(event, templateOverlay, templateModal, templateClose);
    return;
  }
  trapModalTab(event, subagentsOverlay, subagentsModal, subagentsClose);
}

document.addEventListener("keydown", trapOpenModalTab);
document.addEventListener("focusin", (event) => {
  const target = event.target;
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

// --- Run project (fixed commands: npm install -> npm start) ---

const runOverlay = document.getElementById("run-overlay");
const runState = document.getElementById("run-state");
const runOutput = document.getElementById("run-output");

document.getElementById("run-btn").addEventListener("click", async () => {
  let running = false;
  try {
    running = (await (await fetch("/api/run/status")).json()).running;
  } catch {
    running = false;
  }
  if (running) {
    // Toggle instead of shoving the panel back: the user closed it for a
    // reason; a click re-opens it to review output or press Stop.
    runOverlay.hidden = !runOverlay.hidden;
    if (!runOverlay.hidden) runState.textContent = "The project is running. Stop is right below.";
    return;
  }
  runOverlay.hidden = false;
  startRun();
});

document.getElementById("run-close").addEventListener("click", () => {
  runOverlay.hidden = true; // hiding does NOT stop the project
});

async function startRun() {
  runOutput.textContent = "";
  runState.textContent = "Starting…";
  try {
    const res = await fetch("/api/run", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)); // untrusted: textContent only
          if (payload.runOut !== undefined) {
            runOutput.textContent += `${payload.runOut}\n`;
            runOutput.scrollTop = runOutput.scrollHeight;
          }
          if (payload.run?.phase === "install") runState.textContent = "Installing dependencies…";
          if (payload.run?.phase === "serve") {
            runState.textContent = "Project running. Previewing it on the right.";
            showPreview(); // the whole point: test the app the moment it serves
            // The panel has done its job: get it out of the way. A click on
            // Run project toggles it back open for output review / Stop.
            window.setTimeout(() => { runOverlay.hidden = true; }, 1400);
          }
          if (payload.run?.phase === "exited") runState.textContent = `Project exited (code ${payload.run.code ?? "killed"}).`;
          if (payload.run?.phase === "failed") runState.textContent = `Run failed: ${payload.run.message ?? "unknown"}`;
        }
      }
    }
  } catch (error) {
    runState.textContent = `Run error: ${error.message}`;
  }
}

document.getElementById("run-start").addEventListener("click", startRun);

document.getElementById("run-stop").addEventListener("click", async () => {
  await fetch("/api/run/stop", { method: "POST" }).catch(() => {});
  runState.textContent = "Stop requested…";
});

function askForKey() {
  keyInput.classList.add("attention");
  keyInput.focus();
  addMessage(
    "system",
    "One step to start building: create a free OpenRouter key at openrouter.ai/keys (no card needed, free tier gives you 50 requests a day) and paste it in the sidebar. It stays in this tab's memory only. Then send again.",
  );
}

keyInput.addEventListener("input", () => {
  keyInput.classList.remove("attention");
});

newChatBtn.addEventListener("click", async () => {
  historyEpoch++; // a restore already in flight must not repaint this state
  await fetch("/api/reset", { method: "POST" }).catch(() => {});
  showWelcome(); // the greeting IS the new-chat state
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptEl.value.trim();
  const model = modelSelect.value;
  const key = apiKey();
  if (prompt.length === 0 || modelSelect.disabled) return;
  if (key.length === 0) {
    // The build is the product; the key is one 30-second step, asked for
    // exactly when it is needed — never as a gate in front of the app.
    askForKey();
    return;
  }

  historyEpoch++; // the live turn owns the transcript from here
  addMessage("user", prompt);
  promptEl.value = "";
  promptEl.style.height = "auto";
  sendBtn.disabled = true;

  let currentAssistant = addMessage("assistant", "");
  currentAssistant.classList.add("thinking"); // three dots until the first token
  let usage = null;
  let lastToolLine = null;
  const toolLines = new Map();
  let pendingDelta = "";
  let renderFrame = 0;
  let lastRound = 0;
  let sawText = false;
  let finished = false;

  const finishCurrentAssistant = () => {
    if (renderFrame !== 0) {
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
    }
    if (currentAssistant === null) {
      pendingDelta = "";
      return;
    }
    if (pendingDelta.length > 0) {
      currentAssistant.textContent += pendingDelta;
      pendingDelta = "";
      autoScroll();
    }
    currentAssistant.classList.remove("thinking", "streaming");
    if (currentAssistant.textContent.length === 0) {
      currentAssistant.parentElement?.remove();
    } else {
      attachCopyButton(currentAssistant);
    }
    currentAssistant = null;
  };

  const startAssistant = () => {
    currentAssistant = addMessage("assistant", "");
    currentAssistant.classList.add("thinking");
  };

  const flushDelta = () => {
    renderFrame = 0;
    if (pendingDelta.length === 0 || currentAssistant === null) return;
    currentAssistant.textContent += pendingDelta;
    pendingDelta = "";
    autoScroll();
  };

  const queueDelta = (delta) => {
    sawText = true;
    if (currentAssistant === null) startAssistant();
    if (currentAssistant.classList.contains("thinking")) {
      currentAssistant.textContent = "";
      currentAssistant.classList.remove("thinking");
      currentAssistant.classList.add("streaming");
    }
    pendingDelta += delta;
    if (renderFrame === 0) renderFrame = requestAnimationFrame(flushDelta);
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "X-OpenRouter-Key": key },
      body: JSON.stringify({ model, message: prompt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (typeof payload.round === "number") {
            // A fresh model round gets its own assistant block, so prose that
            // follows tool output never backfills above the tool line. A retry
            // can restart at round 1, which also starts a fresh block.
            if (payload.round <= lastRound || payload.round > 1) {
              finishCurrentAssistant();
              startAssistant();
            }
            lastRound = payload.round;
          }
          if (payload.delta !== undefined) {
            queueDelta(payload.delta);
          }
          if (payload.tool !== undefined) {
            if (payload.tool.phase === "start") {
              finishCurrentAssistant();
              const line = addToolLine(payload.tool.name, payload.tool.id);
              lastToolLine = line;
              if (typeof payload.tool.id === "string" && payload.tool.id.length > 0) {
                toolLines.set(payload.tool.id, line);
              }
            } else {
              const line = typeof payload.tool.id === "string"
                ? toolLines.get(payload.tool.id) ?? lastToolLine
                : lastToolLine;
              if (line !== null) {
                const transcriptId = typeof payload.tool.childId === "string"
                  ? subagentLogId(payload.tool.name, payload.tool.childId)
                  : null;
                setToolLine(
                  line,
                  payload.tool.name,
                  payload.tool.ok === true,
                  typeof payload.tool.summary === "string" ? payload.tool.summary : "",
                  transcriptId,
                );
                if (typeof payload.tool.id === "string") toolLines.delete(payload.tool.id);
                if (line === lastToolLine) lastToolLine = null;
              }
            }
          }
          if (payload.plan !== undefined) renderPlan(payload.plan);
          if (payload.usage !== undefined) usage = payload.usage;
          if (payload.done === true) {
            finished = true;
            finishCurrentAssistant();
            usageLine.textContent = usage
              ? `${model} · ${usage.totalTokens} tokens · ${usage.costUsd === null ? "free tier" : `$${usage.costUsd.toFixed(6)}`}`
              : model;
          }
          if (payload.note !== undefined) {
            finishCurrentAssistant();
            addMessage("system", payload.note);
          }
          if (payload.compaction !== undefined) {
            finishCurrentAssistant();
            const count = payload.compaction.pruned;
            addMessage(
              "system",
              `Context compacted: ${count} older tool result${count === 1 ? "" : "s"} summarized to stay within the model budget.`,
            );
          }
          if (payload.error !== undefined) throw new Error(payload.error);
        }
      }
    }

    if (!finished) finishCurrentAssistant();
    if (!sawText) {
      const empty = addMessage("assistant", "(empty response)");
      attachCopyButton(empty);
    }
  } catch (error) {
    finishCurrentAssistant();
    addMessage("system-error", error.message);
  } finally {
    if (renderFrame !== 0) {
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
    }
    sendBtn.disabled = modelSelect.disabled;
    promptEl.focus();
  }
});

promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

// Auto-grow the composer with its content (CSS caps it at 180px).
promptEl.addEventListener("input", () => {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
});
