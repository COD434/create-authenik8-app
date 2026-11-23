// Small UI primitives: status, toasts, modals, and message rendering.

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

function readCodeFence(lines, index) {
  const fence = /^\s*```\s*([\w#+.-]*)\s*$/.exec(lines[index]);
  const language = fence[1] ?? "";
  index++;
  const body = [];
  while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
    body.push(lines[index]);
    index++;
  }
  if (index < lines.length) index++;
  return { node: codeBlockNode(body.join("\n"), language), next: index };
}

function readListBlock(lines, index, ordered) {
  const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const list = document.createElement(ordered ? "ol" : "ul");
  while (index < lines.length && pattern.test(lines[index])) {
    const item = document.createElement("li");
    item.append(...inlineNodes(lines[index].replace(pattern, "")));
    list.appendChild(item);
    index++;
  }
  return { node: list, next: index };
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

    if (/^\s*```\s*([\w#+.-]*)\s*$/.test(line)) {
      const fence = readCodeFence(lines, index);
      index = fence.next;
      md.appendChild(fence.node);
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
      const list = readListBlock(lines, index, false);
      index = list.next;
      md.appendChild(list.node);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = readListBlock(lines, index, true);
      index = list.next;
      md.appendChild(list.node);
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

