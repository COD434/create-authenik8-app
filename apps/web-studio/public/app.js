/* Authenik8 client (v1): BYOK key in memory only; SSE agent loop with sandboxed file tools. */

const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const composer = document.getElementById("composer");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stop");
const newChatBtn = document.getElementById("new-chat");
const usageLine = document.getElementById("usage-line");
const appShell = document.getElementById("app-shell");
const previewStage = document.getElementById("preview-stage");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarOpen = document.getElementById("sidebar-open");
const scrim = document.getElementById("scrim");
const workspaceStatus = document.getElementById("workspace-status");
const workspaceStatusText = document.getElementById("workspace-status-text");
const connectBtn = document.getElementById("connect-btn");
const connectState = document.getElementById("connect-state");
const composerExpand = document.getElementById("composer-expand");
const composerOptions = document.getElementById("composer-options");
const keyStatus = document.getElementById("key-status");
const themeSelect = document.getElementById("theme-select");
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsModal = settingsOverlay.querySelector(".settings-modal");
const settingsClose = document.getElementById("settings-close");
const settingsDone = document.getElementById("settings-done");
const settingsKeyState = document.getElementById("settings-key-state");
const settingsConnect = document.getElementById("settings-connect");
const themeButtons = [...document.querySelectorAll("#settings-theme [data-theme-choice]")];
const paletteOverlay = document.getElementById("palette-overlay");
const paletteModal = paletteOverlay.querySelector(".palette");
const paletteInput = document.getElementById("palette-input");
const paletteList = document.getElementById("palette-list");
const paletteOpenBtn = document.getElementById("palette-open");
const paletteKey = document.getElementById("palette-key");
const toastRegion = document.getElementById("toast-region");
const mobileQuery = window.matchMedia("(max-width: 900px)");
let chatRunning = false;
let chatController = null;
let runPhase = "idle";
let settingsOpener = null;
let paletteOpener = null;
let mobileSidebarOpener = null;
let paletteEntries = [];
let paletteIndex = 0;
const planPanel = document.getElementById("plan-panel");
const planSteps = document.getElementById("plan-steps");
const planCount = document.getElementById("plan-count");
const subagentsOverlay = document.getElementById("subagents-overlay");
const pricingOverlay = document.getElementById("pricing-overlay");
const pricingModal = pricingOverlay.querySelector(".agent-modal");
const pricingBtn = document.getElementById("pricing-btn");
const pricingClose = document.getElementById("pricing-close");
const pricingStatus = document.getElementById("pricing-status");
let pricingOpener = null;
const shipBtn = document.getElementById("ship-btn");
const shipOverlay = document.getElementById("ship-overlay");
const shipModal = shipOverlay.querySelector(".ship-modal");
const shipClose = document.getElementById("ship-close");
const shipDone = document.getElementById("ship-done");
const shipState = document.getElementById("ship-state");
const shipProject = document.getElementById("ship-project");
const shipStaticNote = document.getElementById("ship-static-note");
const shipRefresh = document.getElementById("ship-refresh");
const shipTabButtons = [...shipOverlay.querySelectorAll("[data-ship-tab]")];
const shipPanels = [...shipOverlay.querySelectorAll(".ship-panel")];
const shipSupabaseDot = document.getElementById("ship-supabase-dot");
const shipSupabaseState = document.getElementById("ship-supabase-state");
const shipSupabaseDetail = document.getElementById("ship-supabase-detail");
const shipSupabaseUrl = document.getElementById("ship-supabase-url");
const shipSupabaseKey = document.getElementById("ship-supabase-key");
const shipSupabaseDb = document.getElementById("ship-supabase-db");
const shipSupabaseVerify = document.getElementById("ship-supabase-verify");
const shipSupabaseSave = document.getElementById("ship-supabase-save");
const shipSupabaseResult = document.getElementById("ship-supabase-result");
const shipVercelToken = document.getElementById("ship-vercel-token");
const shipVercelName = document.getElementById("ship-vercel-name");
const shipVercelDeploy = document.getElementById("ship-vercel-deploy");
const shipVercelResult = document.getElementById("ship-vercel-result");
const shipNetlifyToken = document.getElementById("ship-netlify-token");
const shipNetlifyName = document.getElementById("ship-netlify-name");
const shipNetlifySite = document.getElementById("ship-netlify-site");
const shipNetlifyDeploy = document.getElementById("ship-netlify-deploy");
const shipNetlifyResult = document.getElementById("ship-netlify-result");
let shipOpener = null;
let shipTab = "supabase";
let shipStatus = null;
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

function setWorkspaceStatus(text, tone = "idle") {
  if (workspaceStatus === null || workspaceStatusText === null) return;
  workspaceStatus.dataset.tone = tone;
  workspaceStatusText.textContent = text;
  const dot = workspaceStatus.querySelector(".status-dot");
  if (dot !== null) dot.dataset.tone = tone;
}

// Status is derived from real work only. If the user closes a panel while a
// run is still alive, the chip must keep saying so.
function refreshIdleStatus() {
  if (chatRunning) {
    setWorkspaceStatus("Generating", "live");
    return;
  }
  if (agentRunning) {
    setWorkspaceStatus("Agent running", "live");
    return;
  }
  if (templateBusy) {
    setWorkspaceStatus("Generating project", "live");
    return;
  }
  if (runPhase === "starting" || runPhase === "installing") {
    setWorkspaceStatus(runPhase === "starting" ? "Starting project" : "Installing dependencies", "live");
    return;
  }
  if (runPhase === "running") {
    setWorkspaceStatus("Project running", "ok");
    return;
  }
  if (runPhase === "stopping") {
    setWorkspaceStatus("Stopping project", "warn");
    return;
  }
  if (previewPane.classList.contains("open")) {
    setWorkspaceStatus("Preview open", "ok");
    return;
  }
  setWorkspaceStatus("Conversation", "idle");
}

function setActiveNav(id, active) {
  const button = document.getElementById(id);
  if (button === null) return;
  button.classList.toggle("is-active", active);
  if (active) button.setAttribute("aria-current", "page");
  else button.removeAttribute("aria-current");
  if (!id.endsWith("-btn")) return;
  const key = id.slice(0, -4);
  const state = document.querySelector(`[data-nav-state="${key}"]`);
  if (state !== null) state.dataset.on = String(active);
}

function notify(message, tone = "") {
  if (toastRegion === null) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  if (tone === "ok" || tone === "error") toast.dataset.tone = tone;
  toast.textContent = message;
  toastRegion.appendChild(toast);
  while (toastRegion.childElementCount > 3) toastRegion.firstElementChild.remove();
  window.setTimeout(() => { toast.remove(); }, 2800);
}

// The key never leaves this tab and is never echoed back, not even masked.
function syncKeyState() {
  const hasKey = apiKey().length > 0;
  if (keyStatus !== null) {
    keyStatus.textContent = hasKey ? "Key in this tab's memory." : "No key in this tab.";
    keyStatus.dataset.on = String(hasKey);
  }
  if (settingsKeyState !== null) {
    settingsKeyState.textContent = hasKey ? "Key set for this tab." : "No key in this tab.";
    settingsKeyState.dataset.on = String(hasKey);
  }
  if (connectState !== null) {
    connectState.textContent = hasKey ? "Key set" : "No key";
    connectState.dataset.on = String(hasKey);
  }
  if (settingsConnect !== null) {
    settingsConnect.textContent = hasKey ? "Replace key" : "Open connection";
  }
}

function syncChatControls() {
  stopBtn.hidden = !chatRunning;
  sendBtn.disabled = chatRunning || modelSelect.disabled;
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
  if (mobileQuery.matches
    && opener instanceof HTMLElement
    && sidebar.contains(opener)
    && !appShell.classList.contains("sidebar-open")) {
    // The drawer closed behind the dialog. Sending focus to an off-canvas
    // control would strand the keyboard user, so return to the drawer button.
    sidebarOpen.focus();
    return;
  }
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
const TOOL_SVG = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"/></svg>';
const COPY_SVG = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.2" y="5.2" width="7.2" height="7.2" rx="1.5"/><path d="M10.8 3.6H4.5a1 1 0 0 0-1 1v6.3"/></svg>';
const PALETTE_ICONS = {
  new: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>',
  template: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 6.4 8 2.2l5.8 4.2M3.6 13.8V8.2l4.4 3.2 4.4-3.2v5.6"/></svg>',
  agent: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 1.6 4.6 9h2.9l-1 5.4L13 7.2H9.6l1.6-5.6Z"/></svg>',
  subagents: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="12" cy="3.5" r="1.6"/><circle cx="8" cy="12.5" r="1.6"/><path d="M4 5.1v1.4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5.1M8 8.5v2.4"/></svg>',
  preview: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.3 8s2.4-4.2 6.7-4.2S14.7 8 14.7 8s-2.4 4.2-6.7 4.2S1.3 8 1.3 8Z"/><circle cx="8" cy="8" r="1.9"/></svg>',
  run: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/><path d="M6.6 5.4v5.2l4.2-2.6-4.2-2.6Z"/></svg>',
  export: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4v7.4M5 7l3 3 3-3M2.8 13.4h10.4"/></svg>',
  ship: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 2.2c1.9-.5 3.7-.3 4.2.2s.7 2.3.2 4.2c-.6 2.2-2.4 4-4.6 4.6l-1.7-1.7-1.7-1.7c.6-2.2 2.4-4 4.6-4.6Z"/><circle cx="10.6" cy="5.4" r="1.2"/><path d="M5.9 10.1 2.4 13.6M4.8 7.8l-2.1.4-.9 2.9 3.1-.3M8.2 11.2l-.4 2.1-2.9.9.3-3.1"/></svg>',
  key: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.2" cy="8" r="2.5"/><path d="M7.7 8h6.1M11.3 8v2.1M9.2 8v1.5"/></svg>',
  settings: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"/></svg>',
  pricing: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.4 2.4h4.2l6.9 6.9-4.2 4.2-6.9-6.9V2.4Z"/><circle cx="5.4" cy="5.4" r="1.1"/></svg>',
  theme: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"/></svg>',
  stop: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.4"/></svg>',
  sidebar: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.8" y="2.4" width="12.4" height="11.2" rx="2.2"/><path d="M6.2 2.6v10.8M4 6.3H2.9M4 9.7H2.9"/></svg>',
};

// Assistant text is rendered with DOM nodes, never HTML strings. Fenced code
// blocks stay monospace and copyable, and every other token is text.
function inlineNodes(text) {
  const nodes = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      nodes.push(strong);
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      nodes.push(code);
    } else {
      const em = document.createElement("em");
      em.textContent = token.slice(1, -1);
      nodes.push(em);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

function codeBlockNode(code, language) {
  const figure = document.createElement("figure");
  figure.className = "code-block";
  const caption = document.createElement("figcaption");
  const label = document.createElement("span");
  label.textContent = language === "" ? "code" : language;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "code-copy";
  copy.title = "Copy code";
  copy.setAttribute("aria-label", "Copy code");
  copy.innerHTML = COPY_SVG;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify("Code copied", "ok");
    } catch {
      notify("Clipboard blocked by the browser", "error");
    }
  });
  caption.append(label, copy);
  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  figure.append(caption, pre);
  return figure;
}

function isBlockLine(line) {
  return /^\s*```/.test(line)
    || /^#{1,4}\s+/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line);
}

function renderRichText(element, text) {
  element.textContent = "";
  element.dataset.copyText = text;
  element.classList.add("rich");
  const md = document.createElement("div");
  md.className = "md";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") { index++; continue; }

    const fence = /^\s*```\s*([\w#+.-]*)\s*$/.exec(line);
    if (fence !== null) {
      const language = fence[1] ?? "";
      index++;
      const body = [];
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index++;
      }
      if (index < lines.length) index++;
      md.appendChild(codeBlockNode(body.join("\n"), language));
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const level = heading[1].length;
      const tag = level >= 4 ? "h5" : level >= 3 ? "h4" : "h3";
      const title = document.createElement(tag);
      title.append(...inlineNodes(heading[2]));
      md.appendChild(title);
      index++;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const list = document.createElement("ul");
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const item = document.createElement("li");
        item.append(...inlineNodes(lines[index].replace(/^\s*[-*+]\s+/, "")));
        list.appendChild(item);
        index++;
      }
      md.appendChild(list);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = document.createElement("ol");
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        const item = document.createElement("li");
        item.append(...inlineNodes(lines[index].replace(/^\s*\d+[.)]\s+/, "")));
        list.appendChild(item);
        index++;
      }
      md.appendChild(list);
      continue;
    }

    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() !== "" && !isBlockLine(lines[index])) {
      paragraph.push(lines[index]);
      index++;
    }
    const body = document.createElement("p");
    body.append(...inlineNodes(paragraph.join("\n")));
    md.appendChild(body);
  }
  element.appendChild(md);
}

function formatAssistantMessage(element) {
  if (element === null || element.dataset.rich === "true") return;
  renderRichText(element, element.textContent);
  element.dataset.rich = "true";
}

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
  usageLine.textContent = "local · BYOK · no telemetry";
  welcomeEl.hidden = false;
  refreshIdleStatus();
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
  if (!paletteOverlay.hidden) {
    closePalette();
    return;
  }
  if (!settingsOverlay.hidden) {
    closeSettings();
    return;
  }
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
  if (!pricingOverlay.hidden) {
    closePricing();
    return;
  }
  if (!shipOverlay.hidden) {
    closeShip();
    return;
  }
  if (appShell.classList.contains("sidebar-open")) {
    closeMobileSidebar();
    return;
  }
  if (!composerOptions.hidden) {
    closeComposerOptions();
    composerExpand.focus();
    return;
  }
  const runOverlay = document.getElementById("run-overlay");
  if (!runOverlay.hidden) {
    runOverlay.hidden = true;
    setActiveNav("run-btn", false);
    refreshIdleStatus();
  }
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
  setWorkspaceStatus("Agent running", "live");

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
      setWorkspaceStatus(doneEvent.ok ? "Agent finished" : "Agent failed", doneEvent.ok ? "ok" : "error");
    }
  } catch (error) {
    agentState.textContent = `Agent error: ${error.message}`;
    setWorkspaceStatus("Agent failed", "error");
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
const templateProSaas = document.getElementById("template-pro-saas");
const templateProNote = document.getElementById("template-pro-note");
const templateDemo = document.getElementById("template-demo");
const templateDemoRow = document.getElementById("template-demo-row");
const templateActions = document.getElementById("template-actions");
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
  templateDemoRow.hidden = preset !== "fullstack";
  if (preset !== "fullstack") templateProNote.textContent = "";
  if (preset === "fullstack") {
    // The CLI's own contract: fullstack requires PostgreSQL.
    document.getElementById("template-database").value = "postgresql";
  }
}
templatePreset.addEventListener("change", syncTemplateRows);

// The first Pro template: a curated fullstack configuration with demo data.
// It fills the form instead of generating immediately so the user can review.
templateProSaas.addEventListener("click", () => {
  templatePreset.value = "fullstack";
  syncTemplateRows();
  document.getElementById("template-frontend").value = "react";
  document.getElementById("template-database").value = "postgresql";
  document.getElementById("template-package-manager").value = "npm";
  document.getElementById("template-prisma").checked = true;
  templateDemo.checked = true;
  templateProNote.textContent = "SaaS starter selected. Review the options, then generate.";
  templateRunBtn.focus({ preventScroll: true });
});

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
    templateActions.hidden = true;
    templateDismiss.focus();
    return;
  }
  templateForm.hidden = false;
  templateStatus.hidden = true;
  templateActions.hidden = false;
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
document.querySelectorAll(".starter").forEach((starter) => {
  starter.addEventListener("click", () => {
    if (starter.dataset.open === "template") { openTemplate(starter); return; }
    if (starter.dataset.open === "agent") { openAgent(starter); return; }
    promptEl.value = starter.dataset.prompt ?? "";
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
  if (preset === "fullstack") {
    spec.frontend = document.getElementById("template-frontend").value;
    spec.demo = templateDemo.checked;
    // The Studio fullstack form has no provider choice; the CLI requires an
    // explicit OAuth decision, so this configuration is password-only.
    spec.oauthProviders = [];
  }
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
  templateActions.hidden = true;
  if (!templateOverlay.hidden) templateDismiss.focus();
  templateState.textContent = "Generating with the Authenik8 CLI. Runs locally, nothing is uploaded…";
  templateOutput.textContent = "";
  setWorkspaceStatus("Generating project", "live");

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
          setWorkspaceStatus("Project ready", "ok");
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
    setWorkspaceStatus("Template failed", "error");
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

// --- Pricing and waitlist (planned tiers, no checkout, no data collection) ---

function openPricing(opener) {
  if (!pricingOverlay.hidden) {
    pricingClose.focus();
    return;
  }
  pricingOpener = opener instanceof HTMLElement ? opener : modalOpener(pricingBtn);
  pricingStatus.textContent = "";
  pricingOverlay.hidden = false;
  setModalBackgroundInert(pricingOverlay, true);
  pricingClose.focus();
}

function closePricing() {
  if (pricingOverlay.hidden) return;
  pricingOverlay.hidden = true;
  setModalBackgroundInert(pricingOverlay, false);
  const opener = pricingOpener;
  pricingOpener = null;
  restoreModalFocus(opener, pricingBtn);
}

pricingBtn.addEventListener("click", openPricing);
pricingClose.addEventListener("click", closePricing);
pricingOverlay.addEventListener("mousedown", (event) => {
  if (event.target === pricingOverlay) closePricing();
});

document.querySelectorAll(".pricing-cta[data-plan]").forEach((button) => {
  button.addEventListener("click", async () => {
    const plan = button.dataset.plan ?? "Pro";
    const note = `I want to join the Authenik8 ${plan} waitlist. My use case: `;
    try {
      await navigator.clipboard.writeText(note);
      pricingStatus.textContent = `Copied the ${plan} waitlist note. Open the waitlist issue and paste it there.`;
    } catch {
      pricingStatus.textContent = `Clipboard blocked. Open the waitlist issue and write: ${note}`;
    }
  });
});

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
  if (!subagentsOverlay.hidden) {
    trapModalTab(event, subagentsOverlay, subagentsModal, subagentsClose);
    return;
  }
  if (!pricingOverlay.hidden) {
    trapModalTab(event, pricingOverlay, pricingModal, pricingClose);
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
  if (!pricingOverlay.hidden) {
    if (target instanceof Node && pricingModal.contains(target)) return;
    focusModalFirst(pricingModal, pricingClose);
    return;
  }
  if (!shipOverlay.hidden) {
    if (target instanceof Node && shipModal.contains(target)) return;
    focusModalFirst(shipModal, shipClose);
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
    setActiveNav("run-btn", !runOverlay.hidden);
    if (!runOverlay.hidden) {
      runState.textContent = "The project is running. Stop is right below.";
      setWorkspaceStatus("Project running", "ok");
    }
    return;
  }
  runOverlay.hidden = false;
  setActiveNav("run-btn", true);
  startRun();
});

document.getElementById("run-close").addEventListener("click", () => {
  runOverlay.hidden = true; // hiding does NOT stop the project
  setActiveNav("run-btn", false);
  refreshIdleStatus();
});

async function startRun() {
  runOutput.textContent = "";
  runState.textContent = "Starting…";
  runPhase = "starting";
  setWorkspaceStatus("Starting project", "live");
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
          if (payload.run?.phase === "install") {
            runState.textContent = "Installing dependencies…";
            runPhase = "installing";
            setWorkspaceStatus("Installing dependencies", "live");
          }
          if (payload.run?.phase === "serve") {
            runState.textContent = "Project running. Previewing it on the right.";
            runPhase = "running";
            showPreview(); // the whole point: test the app the moment it serves
            setWorkspaceStatus("Project running", "ok");
            // The panel has done its job: get it out of the way. A click on
            // Run project toggles it back open for output review / Stop.
            window.setTimeout(() => {
              runOverlay.hidden = true;
              setActiveNav("run-btn", false);
            }, 1400);
          }
          if (payload.run?.phase === "exited") {
            runPhase = "idle";
            runState.textContent = `Project exited (code ${payload.run.code ?? "killed"}).`;
            setWorkspaceStatus("Project exited", "warn");
          }
          if (payload.run?.phase === "failed") {
            runPhase = "idle";
            runState.textContent = `Run failed: ${payload.run.message ?? "unknown"}`;
            setWorkspaceStatus("Run failed", "error");
          }
        }
      }
    }
  } catch (error) {
    runPhase = "idle";
    runState.textContent = `Run error: ${error.message}`;
    setWorkspaceStatus("Run failed", "error");
  }
}

document.getElementById("run-start").addEventListener("click", startRun);

document.getElementById("run-stop").addEventListener("click", async () => {
  runPhase = "stopping";
  setWorkspaceStatus("Stopping project", "warn");
  await fetch("/api/run/stop", { method: "POST" }).catch(() => {});
  runState.textContent = "Stop requested…";
  notify("Stop requested", "ok");
});

function askForKey() {
  openComposerOptions();
  keyInput.classList.add("attention");
  keyInput.focus();
  addMessage(
    "system",
    "One step to start building: create a free OpenRouter key at openrouter.ai/keys (no card needed, free tier gives you 50 requests a day) and paste it in the composer options. It stays in this tab's memory only. Then send again.",
  );
}

keyInput.addEventListener("input", () => {
  keyInput.classList.remove("attention");
  syncKeyState();
});

async function startNewSession() {
  if (chatRunning) abortChat();
  closeMobileSidebar(false);
  historyEpoch++; // a restore already in flight must not repaint this state
  await fetch("/api/reset", { method: "POST" }).catch(() => {});
  showWelcome(); // the greeting IS the new-chat state
}

newChatBtn.addEventListener("click", () => { void startNewSession(); });

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (chatRunning) return;
  const prompt = promptEl.value.trim();
  const model = modelSelect.value;
  const key = apiKey();
  if (prompt.length === 0 || modelSelect.disabled) return;
  if (key.length === 0) {
    // The build is the product; the key is one 30-second step, asked for
    // exactly when it is needed, never as a gate in front of the app.
    askForKey();
    return;
  }

  chatRunning = true;
  chatController = new AbortController();
  syncChatControls();
  setWorkspaceStatus("Generating", "live");
  closeComposerOptions();
  historyEpoch++; // the live turn owns the transcript from here
  addMessage("user", prompt);
  promptEl.value = "";
  promptEl.style.height = "auto";

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
  let outcome = "ok";

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
      formatAssistantMessage(currentAssistant);
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
      signal: chatController.signal,
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
    if (error instanceof Error && error.name === "AbortError") {
      outcome = "stopped";
      addMessage("system", "Generation stopped. The conversation is saved up to the last received token.");
    } else {
      outcome = "failed";
      addMessage("system-error", error.message);
    }
  } finally {
    if (renderFrame !== 0) {
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
    }
    chatRunning = false;
    chatController = null;
    syncChatControls();
    promptEl.focus();
    if (outcome === "stopped") setWorkspaceStatus("Stopped", "warn");
    else if (outcome === "failed") setWorkspaceStatus("Generation failed", "error");
    else refreshIdleStatus();
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

// --- shell controls ---------------------------------------------------------
// Everything below is wired to real state. Unimplemented destinations stay out
// of the navigation rather than existing as decorative dead ends.

function openComposerOptions() {
  if (composerOptions === null || composerExpand === null) return;
  composerOptions.hidden = false;
  composerExpand.setAttribute("aria-expanded", "true");
}

function closeComposerOptions() {
  if (composerOptions === null || composerExpand === null) return;
  composerOptions.hidden = true;
  composerExpand.setAttribute("aria-expanded", "false");
}

function toggleComposerOptions() {
  if (composerOptions === null) return;
  if (composerOptions.hidden) openComposerOptions();
  else closeComposerOptions();
}

composerExpand.addEventListener("click", toggleComposerOptions);

document.getElementById("composer-agent").addEventListener("click", () => {
  openAgent(document.getElementById("composer-agent"));
});
document.getElementById("composer-template").addEventListener("click", () => {
  openTemplate(document.getElementById("composer-template"));
});

connectBtn.addEventListener("click", () => {
  openComposerOptions();
  keyInput.focus();
});

document.addEventListener("mousedown", (event) => {
  if (composerOptions.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (composerOptions.contains(target) || composerExpand.contains(target)) return;
  closeComposerOptions();
});

// --- appearance -------------------------------------------------------------

const THEME_STORAGE_KEY = "authenik8-theme";
const themeDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function currentThemeChoice() {
  const choice = document.documentElement.dataset.themeChoice;
  return choice === "dark" || choice === "light" ? choice : "system";
}

function syncThemeControls() {
  const choice = currentThemeChoice();
  if (themeSelect !== null) themeSelect.value = choice;
  for (const button of themeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === choice));
  }
}

function applyTheme(choice, persist) {
  const next = choice === "dark" || choice === "light" ? choice : "system";
  const dark = next === "dark" || (next === "system" && themeDarkQuery.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themeChoice = next;
  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked. The choice still applies for this tab.
    }
  }
  syncThemeControls();
}

themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value, true);
});

for (const button of themeButtons) {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.themeChoice ?? "system", true);
  });
}

themeDarkQuery.addEventListener("change", () => {
  if (currentThemeChoice() === "system") applyTheme("system", false);
});

// --- sidebar ----------------------------------------------------------------

const SIDEBAR_STORAGE_KEY = "authenik8-sidebar";

function syncSidebarControls() {
  const collapsed = !mobileQuery.matches && appShell.dataset.sidebar === "collapsed";
  const drawerOpen = appShell.classList.contains("sidebar-open");
  const expanded = mobileQuery.matches ? drawerOpen : !collapsed;
  const label = mobileQuery.matches
    ? (drawerOpen ? "Close navigation" : "Open navigation")
    : (collapsed ? "Expand sidebar" : "Collapse sidebar");
  sidebarToggle.setAttribute("aria-expanded", String(expanded));
  sidebarToggle.setAttribute("aria-label", label);
  sidebarToggle.title = label;
  sidebarOpen.setAttribute("aria-expanded", String(drawerOpen));
}

function setSidebarCollapsed(collapsed, persist = true) {
  appShell.dataset.sidebar = collapsed ? "collapsed" : "expanded";
  if (persist) {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      // Storage can be blocked. The rail still changes for this tab.
    }
  }
  syncSidebarControls();
}

function openMobileSidebar() {
  if (!mobileQuery.matches || appShell.classList.contains("sidebar-open")) return;
  const active = document.activeElement;
  mobileSidebarOpener = active instanceof HTMLElement && active !== document.body && !sidebar.contains(active)
    ? active
    : sidebarOpen;
  appShell.classList.add("sidebar-open");
  scrim.hidden = false;
  syncSidebarControls();
  sidebarToggle.focus({ preventScroll: true });
}

function closeMobileSidebar(restoreFocus = true) {
  if (!appShell.classList.contains("sidebar-open")) return;
  const focusWasInside = sidebar.contains(document.activeElement);
  const opener = mobileSidebarOpener;
  appShell.classList.remove("sidebar-open");
  scrim.hidden = true;
  mobileSidebarOpener = null;
  syncSidebarControls();
  if (!restoreFocus || !focusWasInside) return;
  const target = opener instanceof HTMLElement
    && opener !== document.body
    && opener.isConnected
    && opener.getClientRects().length > 0
    ? opener
    : sidebarOpen;
  target.focus();
}

sidebarToggle.addEventListener("click", () => {
  if (mobileQuery.matches) {
    if (appShell.classList.contains("sidebar-open")) closeMobileSidebar();
    else openMobileSidebar();
    return;
  }
  setSidebarCollapsed(appShell.dataset.sidebar !== "collapsed", true);
});

sidebarOpen.addEventListener("click", openMobileSidebar);
scrim.addEventListener("click", () => closeMobileSidebar());

// On a phone the drawer should get out of the way when a destination opens.
sidebar.addEventListener("click", (event) => {
  if (!mobileQuery.matches) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".nav-item") !== null) closeMobileSidebar();
});

mobileQuery.addEventListener("change", () => {
  if (!mobileQuery.matches && appShell.classList.contains("sidebar-open")) {
    appShell.classList.remove("sidebar-open");
    scrim.hidden = true;
    mobileSidebarOpener = null;
  }
  syncSidebarControls();
});

try {
  const storedRail = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  appShell.dataset.sidebar = storedRail === "collapsed" ? "collapsed" : "expanded";
} catch {
  appShell.dataset.sidebar = "expanded";
}

// --- settings ---------------------------------------------------------------

function openSettings(opener) {
  if (!settingsOverlay.hidden) {
    settingsClose.focus();
    return;
  }
  settingsOpener = opener instanceof HTMLElement ? opener : modalOpener(settingsBtn);
  settingsOverlay.hidden = false;
  setModalBackgroundInert(settingsOverlay, true);
  syncKeyState();
  syncThemeControls();
  settingsClose.focus();
}

function closeSettings() {
  if (settingsOverlay.hidden) return;
  settingsOverlay.hidden = true;
  setModalBackgroundInert(settingsOverlay, false);
  const opener = settingsOpener;
  settingsOpener = null;
  restoreModalFocus(opener, settingsBtn);
}

settingsBtn.addEventListener("click", () => openSettings(settingsBtn));
settingsClose.addEventListener("click", closeSettings);
settingsDone.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("mousedown", (event) => {
  if (event.target === settingsOverlay) closeSettings();
});

settingsConnect.addEventListener("click", () => {
  closeSettings();
  openComposerOptions();
  keyInput.focus();
});

// --- ship ------------------------------------------------------------------

function errorText(error) {
  return error instanceof Error && error.message !== "" ? error.message : "The request failed.";
}

function setShipResult(element, message, tone = "", href = null) {
  element.textContent = "";
  element.dataset.tone = tone;
  if (message !== "") element.append(document.createTextNode(message));
  if (href !== null && href !== "") {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = href;
    element.append(" ", link);
  }
}

function syncShipControls() {
  const staticReady = shipStatus?.project?.kind === "static";
  shipVercelDeploy.disabled = shipBusy || !staticReady;
  shipNetlifyDeploy.disabled = shipBusy || !staticReady;
  shipSupabaseVerify.disabled = shipBusy;
  shipSupabaseSave.disabled = shipBusy || shipStatus?.project?.kind === "empty";
  shipRefresh.disabled = shipBusy;
}

let shipBusy = false;

function renderShipStatus(status) {
  shipStatus = status;
  const project = status?.project ?? { kind: "empty", rootIndex: false };
  const kind = project.kind;
  if (kind === "static") {
    shipProject.textContent = "Static site detected at the sandbox root. Vercel or Netlify can publish it.";
    shipStaticNote.hidden = true;
  } else if (kind === "fullstack") {
    shipProject.textContent = "Fullstack project detected. The frontend is static, but the Express API needs a Node host.";
    shipStaticNote.textContent = "This project has an Express API. A static host would publish the frontend without identity, sessions, or the database, so the Studio will not run that deploy. Export the ZIP and host the API on Railway or Render.";
    shipStaticNote.hidden = false;
  } else if (kind === "server") {
    shipProject.textContent = "Server project detected. Vercel and Netlify static deploys cannot run its Node server.";
    shipStaticNote.textContent = "This project is a server app. Export the ZIP and use a Node host such as Railway or Render. Static hosting would leave the server behind.";
    shipStaticNote.hidden = false;
  } else {
    shipProject.textContent = "The sandbox is empty. Build or generate a project first.";
    shipStaticNote.textContent = "There is no static site to deploy yet. Build a project with an index.html at the sandbox root first.";
    shipStaticNote.hidden = false;
  }

  const supabase = status?.supabase;
  if (supabase?.configured === true) {
    shipSupabaseDot.dataset.tone = "ok";
    shipSupabaseState.textContent = `Connected to ${supabase.url}`;
    const keyLabel = supabase.keyKind === "publishable" ? "publishable" : supabase.keyKind === "anon" ? "anon" : "public";
    const database = supabase.databaseConfigured
      ? ` Database ${supabase.databaseHost}/${supabase.databaseName}.`
      : " No database string saved yet.";
    const external = supabase.externalDatabase ? " External database mode is on." : "";
    shipSupabaseDetail.textContent = `${keyLabel} key.${database}${external}`;
    if (shipSupabaseUrl.value.trim() === "") shipSupabaseUrl.value = supabase.url;
  } else if (supabase?.databaseConfigured === true) {
    shipSupabaseDot.dataset.tone = "warn";
    shipSupabaseState.textContent = "Database saved, public connection missing";
    shipSupabaseDetail.textContent = `Database ${supabase.databaseHost}/${supabase.databaseName}. Add the project URL and public key to finish the connection.`;
  } else {
    shipSupabaseDot.dataset.tone = "idle";
    shipSupabaseState.textContent = "Not connected";
    shipSupabaseDetail.textContent = "Paste the project URL and public key to verify this project.";
  }

  shipState.textContent = supabase?.configured === true ? "Connected" : "Not set";
  syncShipControls();
}

async function refreshShipStatus() {
  try {
    const res = await fetch("/api/integrations");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderShipStatus(await res.json());
  } catch (error) {
    shipStatus = null;
    shipProject.textContent = `Could not read the sandbox: ${errorText(error)}`;
    shipStaticNote.hidden = true;
    shipSupabaseDot.dataset.tone = "idle";
    shipSupabaseState.textContent = "Status unavailable";
    shipSupabaseDetail.textContent = "Could not read the sandbox environment. Refresh to try again.";
    shipState.textContent = "Unknown";
    syncShipControls();
  }
}

async function shipRequest(route, payload) {
  let res;
  try {
    res = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the Studio server. Check that it is still running.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body !== null && typeof body.error === "string" ? body.error : `The request failed with HTTP ${res.status}.`);
  }
  return body ?? {};
}

async function submitSupabase(apply) {
  const url = shipSupabaseUrl.value.trim();
  const key = shipSupabaseKey.value.trim();
  const databaseUrl = shipSupabaseDb.value.trim();
  if (url === "" || key === "") {
    setShipResult(shipSupabaseResult, "Enter the project URL and the public key.", "error");
    (url === "" ? shipSupabaseUrl : shipSupabaseKey).focus();
    return;
  }
  shipBusy = true;
  syncShipControls();
  setShipResult(shipSupabaseResult, apply ? "Verifying and saving..." : "Verifying...", "");
  try {
    const payload = { url, anonKey: key, apply };
    if (databaseUrl !== "") payload.databaseUrl = databaseUrl;
    const body = await shipRequest("/api/integrations/supabase", payload);
    if (apply) {
      shipSupabaseKey.value = "";
      shipSupabaseDb.value = "";
    }
    const database = body.database ? ` Database ${body.database.host}/${body.database.database}.` : "";
    const notes = Array.isArray(body.database?.notes) && body.database.notes.length > 0
      ? ` ${body.database.notes.join(" ")}`
      : "";
    setShipResult(
      shipSupabaseResult,
      `${apply ? "Saved" : "Verified"} ${body.supabase.url} with the ${body.supabase.keyKind} key.${database}${notes}`,
      "ok",
    );
    if (body.status !== undefined) renderShipStatus(body.status);
  } catch (error) {
    setShipResult(shipSupabaseResult, errorText(error), "error");
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

async function deployToProvider(provider) {
  const vercel = provider === "vercel";
  const tokenInput = vercel ? shipVercelToken : shipNetlifyToken;
  const nameInput = vercel ? shipVercelName : shipNetlifyName;
  const result = vercel ? shipVercelResult : shipNetlifyResult;
  const token = tokenInput.value.trim();
  if (token === "") {
    setShipResult(result, "Paste an access token first.", "error");
    tokenInput.focus();
    return;
  }
  if (shipStatus?.project?.kind !== "static") {
    setShipResult(result, "Only a static site can be deployed from the Studio. Export the ZIP for a server project.", "error");
    return;
  }
  shipBusy = true;
  syncShipControls();
  setShipResult(result, `Deploying to ${vercel ? "Vercel" : "Netlify"}...`, "");
  try {
    const payload = { token, name: nameInput.value.trim() };
    if (!vercel) payload.siteId = shipNetlifySite.value.trim();
    const body = await shipRequest(`/api/deploy/${provider}`, payload);
    tokenInput.value = "";
    const state = typeof body.state === "string" && body.state !== "" ? body.state : "queued";
    const count = Number.isFinite(body.files) ? `${body.files} files` : "the site";
    setShipResult(
      result,
      `Deployed ${count} to ${vercel ? "Vercel" : "Netlify"}. State: ${state}.`,
      "ok",
      typeof body.url === "string" ? body.url : null,
    );
  } catch (error) {
    setShipResult(result, errorText(error), "error");
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

function selectShipTab(tab, focus = false) {
  if (!shipTabButtons.some((button) => button.dataset.shipTab === tab)) return;
  shipTab = tab;
  for (const button of shipTabButtons) {
    const active = button.dataset.shipTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }
  for (const panel of shipPanels) panel.hidden = panel.id !== `ship-panel-${tab}`;
}

function clearShipSecrets() {
  shipSupabaseKey.value = "";
  shipSupabaseDb.value = "";
  shipVercelToken.value = "";
  shipNetlifyToken.value = "";
}

function openShip(opener) {
  if (!shipOverlay.hidden) {
    shipClose.focus();
    return;
  }
  shipOpener = opener instanceof HTMLElement ? opener : modalOpener(shipBtn);
  clearShipSecrets();
  setShipResult(shipSupabaseResult, "", "");
  setShipResult(shipVercelResult, "", "");
  setShipResult(shipNetlifyResult, "", "");
  shipOverlay.hidden = false;
  setModalBackgroundInert(shipOverlay, true);
  selectShipTab(shipTab);
  shipClose.focus();
  void refreshShipStatus();
}

function closeShip() {
  if (shipOverlay.hidden) return;
  shipOverlay.hidden = true;
  setModalBackgroundInert(shipOverlay, false);
  clearShipSecrets();
  const opener = shipOpener;
  shipOpener = null;
  restoreModalFocus(opener, shipBtn);
}

shipBtn.addEventListener("click", () => openShip(shipBtn));
shipClose.addEventListener("click", closeShip);
shipDone.addEventListener("click", closeShip);
shipRefresh.addEventListener("click", () => { void refreshShipStatus(); });
shipOverlay.addEventListener("mousedown", (event) => {
  if (event.target === shipOverlay) closeShip();
});
shipSupabaseVerify.addEventListener("click", () => { void submitSupabase(false); });
shipSupabaseSave.addEventListener("click", () => { void submitSupabase(true); });
shipVercelDeploy.addEventListener("click", () => { void deployToProvider("vercel"); });
shipNetlifyDeploy.addEventListener("click", () => { void deployToProvider("netlify"); });

for (const button of shipTabButtons) {
  button.addEventListener("click", () => selectShipTab(button.dataset.shipTab ?? "supabase"));
  button.addEventListener("keydown", (event) => {
    const index = shipTabButtons.indexOf(button);
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % shipTabButtons.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + shipTabButtons.length) % shipTabButtons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = shipTabButtons.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectShipTab(shipTabButtons[next].dataset.shipTab ?? "supabase", true);
  });
}

void refreshShipStatus();

// --- command palette --------------------------------------------------------

function paletteEntriesFor() {
  const previewOpen = previewPane.classList.contains("open");
  const hasKey = apiKey().length > 0;
  const collapsed = !mobileQuery.matches && appShell.dataset.sidebar === "collapsed";
  const drawerOpen = appShell.classList.contains("sidebar-open");
  const entries = [
    {
      id: "new-session",
      title: "New session",
      detail: "Clear the conversation and start fresh",
      icon: PALETTE_ICONS.new,
      keywords: "reset chat clear start",
      run: () => { void startNewSession(); },
    },
    {
      id: "template",
      title: "New from template",
      detail: "Generate a known Authenik8 project with the CLI",
      icon: PALETTE_ICONS.template,
      keywords: "scaffold starter auth oauth fullstack",
      run: () => openTemplate(document.getElementById("template-btn")),
    },
    {
      id: "agent",
      title: "Build with agent",
      detail: "Hand a full project brief to OpenCode",
      icon: PALETTE_ICONS.agent,
      keywords: "opencode automate brief",
      run: () => openAgent(document.getElementById("agent-btn")),
    },
    {
      id: "subagents",
      title: "Subagent runs",
      detail: "Browse read-only explorer, reviewer, and builder transcripts",
      icon: PALETTE_ICONS.subagents,
      keywords: "transcript child explorer reviewer builder",
      run: () => openSubagents(),
    },
    {
      id: "preview",
      title: previewOpen ? "Hide project preview" : "Show project preview",
      detail: previewOpen ? "Return the workspace to the conversation" : "Inspect the sandbox in a viewport",
      icon: PALETTE_ICONS.preview,
      keywords: "viewport frame sandbox open close",
      run: () => {
        if (previewPane.classList.contains("open")) hidePreview();
        else showPreview();
      },
    },
    {
      id: "run",
      title: "Run project",
      detail: "Install and start the sandbox project",
      icon: PALETTE_ICONS.run,
      keywords: "npm install start serve",
      run: () => { document.getElementById("run-btn").click(); },
    },
    {
      id: "export",
      title: "Export project ZIP",
      detail: "Download the current sandbox",
      icon: PALETTE_ICONS.export,
      keywords: "download archive save",
      run: () => { document.getElementById("export-btn").click(); },
    },
    {
      id: "ship",
      title: "Ship project",
      detail: "Connect Supabase or publish a static site to Vercel or Netlify",
      icon: PALETTE_ICONS.ship,
      keywords: "deploy publish host supabase vercel netlify database",
      run: () => openShip(paletteOpenBtn),
    },
    {
      id: "connect",
      title: "OpenRouter connection",
      detail: hasKey ? "Review or replace the key held in this tab" : "Add a free key to start building",
      icon: PALETTE_ICONS.key,
      keywords: "key byok model provider",
      run: () => {
        openComposerOptions();
        keyInput.focus();
      },
    },
    {
      id: "settings",
      title: "Settings",
      detail: "Appearance, connection, and workspace details",
      icon: PALETTE_ICONS.settings,
      keywords: "preferences theme keyboard trust",
      run: () => openSettings(paletteOpenBtn),
    },
    {
      id: "pricing",
      title: "Pricing and waitlist",
      detail: "See planned tiers and copy a waitlist note",
      icon: PALETTE_ICONS.pricing,
      keywords: "plan pro cloud team cost",
      run: () => openPricing(paletteOpenBtn),
    },
    {
      id: "theme-system",
      title: "Appearance: System",
      detail: "Follow the operating system setting",
      icon: PALETTE_ICONS.theme,
      keywords: "theme auto os",
      run: () => applyTheme("system", true),
    },
    {
      id: "theme-dark",
      title: "Appearance: Dark",
      detail: "Always use the dark palette",
      icon: PALETTE_ICONS.theme,
      keywords: "theme night",
      run: () => applyTheme("dark", true),
    },
    {
      id: "theme-light",
      title: "Appearance: Light",
      detail: "Always use the light palette",
      icon: PALETTE_ICONS.theme,
      keywords: "theme day",
      run: () => applyTheme("light", true),
    },
    {
      id: "sidebar",
      title: mobileQuery.matches
        ? (drawerOpen ? "Close navigation" : "Open navigation")
        : (collapsed ? "Expand sidebar" : "Collapse sidebar"),
      detail: mobileQuery.matches ? "Open or close the workspace drawer" : "Change how much room the workspace rail takes",
      icon: PALETTE_ICONS.sidebar,
      keywords: "rail collapse expand navigation",
      run: () => {
        if (mobileQuery.matches) {
          if (appShell.classList.contains("sidebar-open")) closeMobileSidebar();
          else openMobileSidebar();
          return;
        }
        setSidebarCollapsed(appShell.dataset.sidebar !== "collapsed", true);
      },
    },
  ];
  if (chatRunning) {
    entries.unshift({
      id: "stop",
      title: "Stop generating",
      detail: "Abort the current reply and keep the tokens already received",
      icon: PALETTE_ICONS.stop,
      keywords: "cancel abort halt",
      run: abortChat,
    });
  }
  return entries;
}

function setPaletteIndex(index, scroll = true) {
  if (paletteEntries.length === 0) {
    paletteInput.removeAttribute("aria-activedescendant");
    return;
  }
  const length = paletteEntries.length;
  paletteIndex = ((index % length) + length) % length;
  const items = [...paletteList.querySelectorAll(".palette-item")];
  items.forEach((item, itemIndex) => {
    const active = itemIndex === paletteIndex;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
  });
  const current = items[paletteIndex];
  if (current === undefined) return;
  paletteInput.setAttribute("aria-activedescendant", current.id);
  if (scroll) current.scrollIntoView({ block: "nearest" });
}

function renderPalette() {
  const query = paletteInput.value.trim().toLowerCase();
  const all = paletteEntriesFor();
  paletteEntries = query === ""
    ? all
    : all.filter((entry) => {
      const haystack = `${entry.title} ${entry.detail} ${entry.keywords}`.toLowerCase();
      return haystack.includes(query);
    });
  paletteList.textContent = "";
  if (paletteEntries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "palette-empty";
    empty.textContent = "No matching actions.";
    paletteList.appendChild(empty);
    paletteInput.removeAttribute("aria-activedescendant");
    return;
  }
  paletteEntries.forEach((entry, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "palette-item";
    item.id = `palette-entry-${entry.id}`;
    item.dataset.index = String(index);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    const icon = document.createElement("span");
    icon.className = "palette-item-icon";
    icon.innerHTML = entry.icon; // static local SVG, never user data
    const copy = document.createElement("span");
    copy.className = "palette-item-copy";
    const title = document.createElement("span");
    title.className = "palette-item-title";
    title.textContent = entry.title;
    const detail = document.createElement("span");
    detail.className = "palette-item-detail";
    detail.textContent = entry.detail;
    copy.append(title, detail);
    item.append(icon, copy);
    item.addEventListener("click", () => {
      paletteIndex = index;
      runPaletteEntry();
    });
    item.addEventListener("mouseenter", () => setPaletteIndex(index, false));
    paletteList.appendChild(item);
  });
  setPaletteIndex(0, false);
}

function runPaletteEntry() {
  const entry = paletteEntries[paletteIndex];
  if (entry === undefined) return;
  closePalette();
  entry.run();
}

function openPalette(opener) {
  if (!paletteOverlay.hidden) return;
  closeComposerOptions();
  closeMobileSidebar(false);
  paletteOpener = opener instanceof HTMLElement ? opener : modalOpener(paletteOpenBtn);
  paletteOverlay.hidden = false;
  setModalBackgroundInert(paletteOverlay, true);
  paletteInput.value = "";
  renderPalette();
  paletteInput.focus();
}

function closePalette() {
  if (paletteOverlay.hidden) return;
  paletteOverlay.hidden = true;
  setModalBackgroundInert(paletteOverlay, false);
  const opener = paletteOpener;
  paletteOpener = null;
  paletteEntries = [];
  paletteInput.value = "";
  restoreModalFocus(opener, paletteOpenBtn);
}

paletteOpenBtn.addEventListener("click", () => openPalette(paletteOpenBtn));
paletteOverlay.addEventListener("mousedown", (event) => {
  if (event.target === paletteOverlay) closePalette();
});
paletteInput.addEventListener("input", renderPalette);
paletteInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setPaletteIndex(paletteIndex + 1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setPaletteIndex(paletteIndex - 1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    runPaletteEntry();
  }
});

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") return;
  event.preventDefault();
  if (!paletteOverlay.hidden) {
    closePalette();
    return;
  }
  if (!settingsOverlay.hidden
    || !agentOverlay.hidden
    || !templateOverlay.hidden
    || !subagentsOverlay.hidden
    || !pricingOverlay.hidden
    || !shipOverlay.hidden) return;
  openPalette(document.activeElement instanceof HTMLElement ? document.activeElement : paletteOpenBtn);
});

if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  paletteKey.textContent = "⌘ K";
  const shortcutPalette = document.getElementById("shortcut-palette");
  if (shortcutPalette !== null) {
    shortcutPalette.textContent = "";
    const command = document.createElement("kbd");
    command.textContent = "⌘";
    const key = document.createElement("kbd");
    key.textContent = "K";
    shortcutPalette.append(command, " ", key);
  }
}

// --- stop generation --------------------------------------------------------

function abortChat() {
  if (!chatRunning || chatController === null) return;
  setWorkspaceStatus("Stopping", "warn");
  chatController.abort();
}

stopBtn.addEventListener("click", () => {
  if (!chatRunning) return;
  abortChat();
  notify("Stopping generation", "ok");
});

// --- initial state ----------------------------------------------------------

applyTheme(currentThemeChoice(), false);
syncSidebarControls();
syncKeyState();
syncChatControls();
refreshIdleStatus();
