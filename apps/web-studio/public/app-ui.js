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
  // New messages should land in view. Streaming text only follows the bottom
  // when the reader is already there, so scrolling up is never yanked away.
  if (force || nearBottom()) {
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
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
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
  } catch {
    // Ignore storage failures (private mode / blocked storage).
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
function sanitizeAssistantText(text) {
  if (typeof text !== "string" || text.length === 0) return "";
  // Some models leak raw tool-call traces into content (e.g. DeepSeek XML form).
  // Strip them from visible chat; real tool execution is shown via tool records.
  let cleaned = text.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "");
  cleaned = cleaned.replace(/<tool_call\b[^>]*>[\s\S]*$/gi, ""); // unclosed trailing trace
  // Orphan DeepSeek-style trace tags outside a tool_call block.
  cleaned = cleaned.replace(/<\/?tool_call\b[^>]*>/gi, "");
  cleaned = cleaned.replace(/<function=[^>\n]+>/gi, "");
  cleaned = cleaned.replace(/<\/function>/gi, "");
  cleaned = cleaned.replace(/<parameter=[^>\n]+>/gi, "");
  cleaned = cleaned.replace(/<\/parameter>/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function safeHref(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") return parsed.href;
  } catch { /* ignore */ }
  return null;
}

function inlineNodes(text) {
  const nodes = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*[^*\n]+\*)/g;
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
    } else if (token.startsWith("[")) {
      const label = match[2] ?? "";
      const href = safeHref(match[3] ?? "");
      if (href === null) {
        nodes.push(document.createTextNode(token));
      } else {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label;
        nodes.push(a);
      }
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

function highlightCode(codeEl, code, language) {
  const lang = (language || "").toLower();
  const supported = /^(js|javascript|ts|typescript|json|bash|sh|shell|html|css|xml|yaml|yml|sql|py|python|go|rs|rust)$/.test(lang);
  if (!supported) return;
  const tokenDefs = [
    { type: "comment", re: lang.match(/^(html|xml)$/) ? /<!--[\s\S]*?-->/y : lang.match(/^(css)$/) ? /\/\*[\s\S]*?\*\//y : lang.match(/^(bash|sh|shell|yaml|yml|py|python)$/) ? /#.*/y : /\/\/.*|\/\*[\s\S]*?\*\//y },
    { type: "string", re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y },
    { type: "number", re: /\b\d+(?:\.\d+)?\b/y },
    { type: "keyword", re: /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|from|export|default|async|await|type|interface|enum|implements|public|private|protected|readonly|true|false|null|undefined|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|ON|AND|OR|NOT|CREATE|TABLE|def|print|self|import|as|elif|None|True|False)\b/y },
  ];
  const frag = document.createDocumentFragment();
  let i = 0;
  while (i < code.length) {
    let matched = false;
    for (const def of tokenDefs) {
      def.re.lastIndex = i;
      const m = def.re.exec(code);
      if (m && m.index === i) {
        const span = document.createElement("span");
        span.className = `tok-${def.type}`;
        span.textContent = m[0];
        frag.appendChild(span);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      frag.appendChild(document.createTextNode(code[i]));
      i += 1;
    }
  }
  codeEl.textContent = "";
  codeEl.appendChild(frag);
}

function codeBlockNode(code, language, closed = true) {
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
  if (closed) highlightCode(codeEl, code, language);
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
  const closed = index < lines.length;
  if (closed) index++;
  return { node: codeBlockNode(body.join("\n"), language, closed), next: index };
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

function splitMarkdownBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") { index++; continue; }

    if (/^\s*```/.test(line)) {
      const start = index;
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) index++;
      if (index < lines.length) index++;
      blocks.push(lines.slice(start, index).join("\n"));
      continue;
    }

    if (/^(#{1,4})\s+/.test(line)) {
      blocks.push(line);
      index++;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const start = index;
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) index++;
      blocks.push(lines.slice(start, index).join("\n"));
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const start = index;
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) index++;
      blocks.push(lines.slice(start, index).join("\n"));
      continue;
    }

    const start = index;
    index++;
    while (index < lines.length && lines[index].trim() !== "" && !isBlockLine(lines[index])) index++;
    blocks.push(lines.slice(start, index).join("\n"));
  }
  return blocks;
}

function renderMarkdownBlock(source) {
  const lines = source.split("\n");
  if (lines.length === 0) return document.createTextNode("");
  const line = lines[0];
  if (/^\s*```/.test(line)) return readCodeFence(lines, 0).node;
  const heading = /^(#{1,4})\s+(.*)$/.exec(line);
  if (heading !== null) {
    const level = heading[1].length;
    const tag = level >= 4 ? "h5" : level >= 3 ? "h4" : "h3";
    const title = document.createElement(tag);
    title.append(...inlineNodes(heading[2]));
    return title;
  }
  if (/^\s*[-*+]\s+/.test(line)) return readListBlock(lines, 0, false).node;
  if (/^\s*\d+[.)]\s+/.test(line)) return readListBlock(lines, 0, true).node;
  const body = document.createElement("p");
  body.append(...inlineNodes(lines.join("\n")));
  return body;
}

const richTextCache = new WeakMap();

function renderRichText(element, text) {
  try {
    const clean = sanitizeAssistantText(text);
    element.dataset.copyText = clean;
    element.classList.add("rich");
    let md = element.querySelector(":scope > .md");
    if (md === null) {
      element.textContent = "";
      md = document.createElement("div");
      md.className = "md";
      element.appendChild(md);
    }
    const blocks = splitMarkdownBlocks(clean);
    const prev = richTextCache.get(element) ?? [];
    const next = [];
    let changed = prev.length !== blocks.length;
    for (let i = 0; i < blocks.length; i++) {
      const source = blocks[i];
      const key = i + "\u0000" + source;
      const cached = prev[i];
      if (cached && cached.key === key) {
        next.push(cached);
        continue;
      }
      changed = true;
      next.push({ key, node: renderMarkdownBlock(source) });
    }
    if (!changed) return;
    richTextCache.set(element, next);
    md.replaceChildren(...next.map((b) => b.node));
  } catch {
    // Error boundary per message: never blank the UI on a bad render.
    element.textContent = typeof text === "string" ? text : "";
  }
}

function formatAssistantMessage(element) {
  if (element === null || element.dataset.rich === "true") return;
  renderRichText(element, element.textContent);
  element.dataset.rich = "true";
}

function hideWelcome() {
  if (welcomeEl.hidden || welcomeEl.classList.contains("leaving")) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  if (reduced) { welcomeEl.hidden = true; welcomeEl.classList.remove("leaving"); glideComposer(); return; }
  welcomeEl.classList.add("leaving");
  window.setTimeout(() => { welcomeEl.hidden = true; welcomeEl.classList.remove("leaving"); glideComposer(); }, 150);
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

function addMessage(kind, text) {
  hideWelcome(); // any message replaces the empty state
  const timelineActive = !!window.STUDIO_EXECUTION_TIMELINE;
  const pushStore = (kindName, payload, state = "completed") => {
    if (typeof executionStore === "undefined") return;
    const seq = Date.now() + Math.random();
    executionStore.applyEvent({
      v: 1, id: `se_ui_${seq.toString(36).replace(".", "")}`, seq, ts: new Date().toISOString(),
      sessionId: "local-session", turnId: `turn_ui_${Date.now().toString(36)}`, source: "system",
      kind: kindName, activityId: `ui_${kind}_${seq.toString(36).replace(".", "")}`,
      state, payload,
    });
  };

  if (kind === "assistant") {
    const row = document.createElement("div");
    row.className = "msg-row assistant-row";
    row.dataset.msgId = nextMsgId();
    row.innerHTML = AVATAR_SVG; // static brand markup, never user data
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.textContent = text;
    row.appendChild(el);
    if (!timelineActive) {
      messagesEl.appendChild(row);
      flipMove(row);
      autoScroll();
    }
    return el;
  }
  if (kind === "user") {
    // The row carries the centered column width; the bubble itself must not
    // inherit the `.msg` auto margins or it lands in the middle of the column.
    const row = document.createElement("div");
    row.className = "msg-row user";
    row.dataset.msgId = nextMsgId();
    const el = document.createElement("div");
    el.className = "msg user";
    el.textContent = text;
    row.appendChild(el);
    if (!timelineActive) {
      messagesEl.appendChild(row);
      flipMove(row);
      if (typeof attachUserActions === "function") attachUserActions(el);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
      messagesEl.scrollTo({ top: Math.max(0, row.offsetTop - 24), behavior: reduced ? "auto" : "smooth" });
      jumpLatestBtn.style.willChange = "opacity, transform";
      jumpLatestBtn.addEventListener("transitionend", () => { jumpLatestBtn.style.willChange = ""; }, { once: true });
      updateJumpLatest();
    }
    return el;
  }
  if (timelineActive) {
    if (kind === "system-error") pushStore("error", { message: String(text) }, "failed");
    else pushStore("notice", { message: String(text), type: kind });
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

function showWelcome() {
  messagesEl.innerHTML = "";
  if (typeof executionStore !== "undefined") executionStore.reset();
  renderPlan(null);
  usageLine.textContent = "local · BYOK · no telemetry";
  welcomeEl.hidden = false;
  welcomeEl.classList.remove("leaving");
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

