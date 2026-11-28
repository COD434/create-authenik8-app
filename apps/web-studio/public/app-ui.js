// Small UI primitives: status, toasts, modals, and message rendering.

function apiKey() {
  return keyInput.value.trim();
}

function scrollContainer() {
  if (window.STUDIO_EXECUTION_TIMELINE) {
    const t = document.getElementById("execution-timeline");
    if (t) return t;
  }
  return messagesEl;
}

function nearBottom(threshold = 96) {
  const el = scrollContainer();
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function updateScrollMasks() {
  const el = scrollContainer();
  const { scrollTop, scrollHeight, clientHeight } = el;
  const canScroll = scrollHeight > clientHeight + 1;
  const top = canScroll && scrollTop > 8 ? 20 : 0;
  const bottom = canScroll && scrollTop + clientHeight < scrollHeight - 8 ? 20 : 0;
  el.style.setProperty("--mask-top", `${top}px`);
  el.style.setProperty("--mask-bottom", `${bottom}px`);
}

function updateJumpLatest() {
  if (jumpLatestBtn === null) return;
  const el = scrollContainer();
  const detached = !nearBottom(96) && el.scrollHeight > el.clientHeight + 120;
  const wasVisible = jumpLatestBtn.classList.contains("is-visible");
  if (detached !== wasVisible) {
    jumpLatestBtn.style.willChange = "opacity, transform";
    jumpLatestBtn.addEventListener("transitionend", () => { jumpLatestBtn.style.willChange = ""; }, { once: true });
  }
  jumpLatestBtn.classList.toggle("is-visible", detached);
  jumpLatestBtn.setAttribute("aria-hidden", detached ? "false" : "true");
  jumpLatestBtn.tabIndex = detached ? 0 : -1;
  updateScrollMasks();
}

function scrollToLatest(behavior = "smooth") {
  const el = scrollContainer();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : behavior });
  jumpLatestBtn.style.willChange = "opacity, transform";
  jumpLatestBtn.addEventListener("transitionend", () => { jumpLatestBtn.style.willChange = ""; }, { once: true });
  updateJumpLatest();
}

function autoScroll(force = false) {
  // New messages should land in view. Streaming text follows the bottom when
  // the reader is already there; while work is running, use a wider threshold
  // so content growth doesn't make the user chase the jump-to-latest button.
  const stickThreshold = (typeof chatRunning !== "undefined" && chatRunning) ? 220 : 96;
  if (force || nearBottom(stickThreshold)) {
    const el = scrollContainer();
    const t0 = performance.now();
    el.scrollTop = el.scrollHeight;
    const dt = performance.now() - t0;
    if (dt > 8) {
      el.style.willChange = "transform";
      el.addEventListener("transitionend", () => { el.style.willChange = ""; }, { once: true });
    }
  }
  updateJumpLatest();
}

if (jumpLatestBtn !== null) {
  jumpLatestBtn.addEventListener("click", () => scrollToLatest("smooth"));
}
scrollContainer().addEventListener("scroll", () => updateJumpLatest(), { passive: true });
messagesEl.addEventListener("scroll", () => updateJumpLatest(), { passive: true });

const DRAFT_KEY = "authenik8.studio.draft";
let msgSeq = 0;
function nextMsgId() { return `m_${Date.now().toString(36)}_${++msgSeq}`; }
function saveDraft() {
  if (promptEl === null) return;
  try {
    const value = promptEl.value;
    if (value.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, value);
  } catch (error) {
    void error; // Ignore storage failures (private mode / blocked storage).
  }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (error) { void error; /* ignore blocked storage */ }
}
function restoreDraft() {
  if (promptEl === null) return;
  try {
    const value = localStorage.getItem(DRAFT_KEY);
    if (typeof value === "string" && value.length > 0 && promptEl.value.length === 0) {
      promptEl.value = value;
      promptEl.style.height = "auto";
      promptEl.style.height = `${Math.min(promptEl.scrollHeight, 190)}px`;
    }
  } catch (error) {
    void error; // Ignore storage failures (private mode / blocked storage).
  }
}
if (promptEl !== null) {
  promptEl.addEventListener("input", saveDraft);
}
restoreDraft();

function setWorkspaceStatus(text, tone = "idle") {
  if (workspaceStatus === null || workspaceStatusText === null) return;
  workspaceStatus.dataset.tone = tone;
  workspaceStatusText.textContent = text;
  const dot = workspaceStatus.querySelector(".status-dot");
  if (dot !== null) dot.dataset.tone = tone;
}

function announceStatus(text) {
  const el = document.getElementById("sr-status");
  if (el !== null) el.textContent = text;
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
  sendBtn.hidden = chatRunning;
  for (const btn of [sendBtn, stopBtn]) {
    if (btn && btn.dataset.wcSet !== "1") { btn.style.willChange = "opacity, transform"; btn.dataset.wcSet = "1"; }
  }
  sendBtn.disabled = !chatRunning && modelSelect.disabled;
  for (const btn of messagesEl.querySelectorAll('.msg-action[data-action="regenerate"], .msg-action[data-action="edit"], .msg-inline-action[data-action="retry"]')) {
    btn.disabled = chatRunning;
  }
  // Timeline actions live outside #messages; a run ending must re-enable them.
  if (typeof window.refreshExecutionTimeline === "function") window.refreshExecutionTimeline();
  window.dispatchEvent(new CustomEvent("studio:chat-state", { detail: { running: chatRunning } }));
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
  theme: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"/></svg>',
  stop: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.4"/></svg>',
  sidebar: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.8" y="2.4" width="12.4" height="11.2" rx="2.2"/><path d="M6.2 2.6v10.8M4 6.3H2.9M4 9.7H2.9"/></svg>',
  quit: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 2.4H3.4a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h2.8M10.4 11.2 13.6 8l-3.2-3.2M13.6 8H6.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

let welcomeHideTimer = 0;
function hideWelcome() {
  const header = document.querySelector(".welcome-header");
  if (header !== null) header.hidden = true; // Product/Docs/Contact belong to the empty state only
  if (welcomeEl.hidden || welcomeEl.classList.contains("leaving")) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  if (reduced) { welcomeEl.hidden = true; welcomeEl.classList.remove("leaving"); glideComposer(); return; }
  welcomeEl.classList.add("leaving");
  // A session switch can re-open the greeting while this exit is still
  // running; the timer must not hide the greeting it just re-opened.
  if (welcomeHideTimer !== 0) window.clearTimeout(welcomeHideTimer);
  welcomeHideTimer = window.setTimeout(() => {
    welcomeHideTimer = 0;
    welcomeEl.hidden = true;
    welcomeEl.classList.remove("leaving");
    glideComposer();
  }, 150);
}

// FLIP glide for the composer from its initial (up) state back to normal.
function glideComposer() {
  if (composer === null) return;
  const chat = composer.closest(".chat");
  if (chat === null || chat.dataset.mode !== "initial") return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  const from = getComputedStyle(composer).transform;
  const rect = composer.getBoundingClientRect();
  chat.dataset.mode = "active";
  const fromStyle = getComputedStyle(composer);
  const fromLeft = parseFloat(fromStyle.left || "0");
  const fromTop = parseFloat(fromStyle.top || "0");
  void rect.width; void rect.height;
  composer.style.willChange = "transform";
  requestAnimationFrame(() => {
    const toStyle = getComputedStyle(composer);
    const dx = parseFloat(toStyle.left || "0") - fromLeft;
    const dy = parseFloat(toStyle.top || "0") - fromTop;
    composer.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      composer.addEventListener("transitionend", () => { composer.style.willChange = ""; }, { once: true });
      composer.style.transition = `transform ${reduced ? "0ms" : "var(--dur-base) var(--ease-out)"}`;
      composer.style.transform = "none";
    });
  });
}

const studioUiPushState = { lastErrMsg: "", lastErrAt: 0 };

function pushStudioUiEvent(kind, kindName, payload, state = "completed") {
  if (typeof executionStore === "undefined") return;
  if (kindName === "error") {
    const msg = String(payload?.message || "");
    const now = Date.now();
    if (studioUiPushState.lastErrMsg === msg && now - studioUiPushState.lastErrAt < 2000) return;
    studioUiPushState.lastErrMsg = msg;
    studioUiPushState.lastErrAt = now;
  }
  const seq = Date.now() + Math.random();
  executionStore.applyEvent({
    v: 1, id: `se_ui_${seq.toString(36).replace(".", "")}`, seq, ts: new Date().toISOString(),
    sessionId: activeSessionId, turnId: `turn_ui_${Date.now().toString(36)}`, source: "system",
    kind: kindName, activityId: `ui_${kind}_${seq.toString(36).replace(".", "")}`, state, payload,
  });
}

function createAssistantMessage(text, timelineActive) {
  if (timelineActive) {
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.textContent = text;
    return el;
  }
  const row = document.createElement("div");
  row.className = "msg-row assistant-row";
  row.dataset.msgId = nextMsgId();
  row.innerHTML = AVATAR_SVG; // canon-ignore A8-SEC-08: static brand markup, never user data
  const el = document.createElement("div");
  el.className = "msg assistant";
  el.textContent = text;
  row.appendChild(el);
  messagesEl.appendChild(row);
  flipMove(row);
  autoScroll();
  return el;
}

function createUserMessage(text, timelineActive) {
  if (timelineActive) {
    const el = document.createElement("div");
    el.className = "msg user";
    el.textContent = text;
    return el;
  }
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.dataset.msgId = nextMsgId();
  const el = document.createElement("div");
  el.className = "msg user";
  el.textContent = text;
  row.appendChild(el);
  messagesEl.appendChild(row);
  flipMove(row);
  if (typeof attachUserActions === "function") attachUserActions(el);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  messagesEl.scrollTo({ top: Math.max(0, row.offsetTop - 24), behavior: reduced ? "auto" : "smooth" });
  jumpLatestBtn.style.willChange = "opacity, transform";
  jumpLatestBtn.addEventListener("transitionend", () => { jumpLatestBtn.style.willChange = ""; }, { once: true });
  updateJumpLatest();
  return el;
}

function createSystemMessage(kind, text, timelineActive) {
  if (timelineActive) {
    if (kind === "system-error") pushStudioUiEvent(kind, "error", { message: String(text) }, "failed");
    else pushStudioUiEvent(kind, "notice", { message: String(text), type: kind });
    return document.createElement("div");
  }
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.dataset.msgId = nextMsgId();
  el.textContent = text;
  if (kind === "system-error") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "msg-inline-action";
    retry.dataset.action = "retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
    });
    el.appendChild(document.createTextNode(" "));
    el.appendChild(retry);
  }
  messagesEl.appendChild(el);
  autoScroll();
  return el;
}

function addMessage(kind, text) {
  hideWelcome(); // any message replaces the empty state
  const timelineActive = !!window.STUDIO_EXECUTION_TIMELINE;
  if (kind === "assistant") return createAssistantMessage(text, timelineActive);
  if (kind === "user") return createUserMessage(text, timelineActive);
  return createSystemMessage(kind, text, timelineActive);
}

function showWelcome() {
  messagesEl.innerHTML = "";
  if (typeof executionStore !== "undefined") executionStore.reset();
  renderPlan(null);
  usageLine.textContent = "local · BYOK · no telemetry";
  if (welcomeHideTimer !== 0) {
    window.clearTimeout(welcomeHideTimer);
    welcomeHideTimer = 0;
  }
  welcomeEl.hidden = false;
  welcomeEl.classList.remove("leaving");
  const header = document.querySelector(".welcome-header");
  if (header !== null) header.hidden = false;
  refreshIdleStatus();
  const chat = document.querySelector(".chat");
  if (chat) chat.dataset.mode = "active";
}

// Light perf instrumentation helper (spec §6 / §4).
window.studioPerf = (() => {
  const frames = [];
  let slowFrames = 0;
  let lastDt = 0;
  const start = () => { frames.push(performance.now()); };
  const end = () => { if (frames.length > 0) frames[frames.length - 1] = performance.now() - frames[frames.length - 1]; };
  const stats = () => {
    const slow = frames.filter((d) => d > 12);
    return { frames: frames.length, slow: slow.length, lastSlowMs: slow.length > 0 ? Math.round(Math.max(...slow)) : 0 };
  };
  const clear = () => { frames.length = 0; };
  const record = (dt) => { lastDt = dt; if (dt > 12) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1); };
  const slowCount = () => slowFrames;
  return { start, end, stats, clear, record, slowCount, lastDt: () => lastDt };
})();

// Generic FLIP utility for cheap element moves (spec §4).
function flipMove(el, measure = null) {
  const clean = el;
  const box = measure ? measure(clean) : clean.getBoundingClientRect();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  const from = clean.getBoundingClientRect();
  clean.style.transform = "none";
  if (reduced) { clean.style.willChange = ""; return clean; }
  clean.style.willChange = "transform";
  clean.style.transform = `translate(${box.left - from.left}px, ${box.top - from.top}px)`;
  requestAnimationFrame(() => {
    clean.style.transition = `transform var(--dur-base) var(--ease-out)`;
    clean.style.transform = "none";
    clean.addEventListener("transitionend", () => { clean.style.willChange = ""; }, { once: true });
  });
  return clean;
}

// Pause decorative loop animations when offscreen (spec §4).
(() => {
  if (!("IntersectionObserver" in window) || !messagesEl) return;
  const selector = ".tool-status[data-status=\"running\"], .reasoning-block.streaming, .msg.assistant.thinking";
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle("is-offscreen", !e.isIntersecting);
  }, { root: messagesEl, threshold: 0.01 });
  const watch = (node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) io.observe(node);
    node.querySelectorAll(selector).forEach((el) => io.observe(el));
  };
  new MutationObserver((mutations) => {
    for (const m of mutations) for (const n of m.addedNodes) watch(n);
  }).observe(messagesEl, { childList: true, subtree: true });
})();

