// Composer, appearance, sidebar, and settings controls.

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
document.getElementById("composer-ai-integration").addEventListener("click", () => {
  openAiIntegration(document.getElementById("composer-ai-integration"));
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

const MOTION_STORAGE_KEY = "authenik8-motion";
const motionReduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function currentMotionChoice() {
  const choice = document.documentElement.dataset.motionChoice;
  return choice === "reduce" ? "reduce" : "system";
}

function syncMotionControls() {
  const choice = currentMotionChoice();
  for (const button of motionButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.motionChoice === choice));
  }
}

function applyMotion(choice, persist) {
  const next = choice === "reduce" ? "reduce" : "system";
  const reduce = next === "reduce" || (next === "system" && motionReduceQuery.matches);
  const root = document.documentElement;
  root.dataset.motion = reduce ? "reduce" : "full";
  root.dataset.motionChoice = next;
  if (persist) {
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked. The choice still applies for this tab.
    }
  }
  syncMotionControls();
}

for (const button of motionButtons) {
  button.addEventListener("click", () => {
    applyMotion(button.dataset.motionChoice ?? "system", true);
  });
}

motionReduceQuery.addEventListener("change", () => {
  if (currentMotionChoice() === "system") applyMotion("system", false);
});
syncMotionControls();

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
  syncMotionControls();
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

async function quitStudio() {
  if (quitStudioBtn !== null && quitStudioBtn.disabled) return;
  const ok = window.confirm("Quit Studio? This stops the local server on this machine.");
  if (!ok) return;
  if (quitStudioBtn !== null) quitStudioBtn.disabled = true;
  if (quitStudioState !== null) quitStudioState.textContent = "Quitting Studio…";
  try {
    const res = await fetch("/api/studio/quit", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (quitStudioState !== null) quitStudioState.textContent = "Studio has stopped. You can close this tab.";
    notify("Studio is stopping", "ok");
  } catch {
    if (quitStudioBtn !== null) quitStudioBtn.disabled = false;
    if (quitStudioState !== null) quitStudioState.textContent = "Could not quit Studio. Try stopping it from the terminal.";
    notify("Could not quit Studio", "error");
  }
}

if (quitStudioBtn !== null) {
  quitStudioBtn.addEventListener("click", () => { void quitStudio(); });
}


// Inspector tabs (Codex-style right pane migration).
(() => {
  const pane = document.getElementById("preview-pane");
  if (!pane) return;
  const tabs = [...pane.querySelectorAll("[data-inspector-tab]")];
  const panels = [...pane.querySelectorAll("[data-inspector-panel]")];
  const viewport = pane.querySelector(".viewport-switch");

  function setTab(name) {
    for (const tab of tabs) {
      const active = tab.dataset.inspectorTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const panel of panels) panel.hidden = panel.dataset.inspectorPanel !== name;
    if (viewport) viewport.style.display = name === "preview" ? "" : "none";
  }
  for (const tab of tabs) tab.addEventListener("click", () => setTab(tab.dataset.inspectorTab || "preview"));
  setTab("preview");

  function renderInspectorSnapshot(body) {
    const diffsEl = document.getElementById("inspector-diffs");
    const filesEl = document.getElementById("inspector-files");
    const terminalEl = document.getElementById("inspector-terminal");
    const metaEl = document.getElementById("inspector-meta");
    if (diffsEl) {
      const changed = Array.isArray(body?.changedFiles) ? body.changedFiles : [];
      const branch = body?.git?.branch || "";
      const diff = body?.git?.diff || "";
      const status = body?.git?.status || "";
      diffsEl.textContent = "";
      const frag = document.createDocumentFragment();
      if (branch) {
        const b = document.createElement("div");
        b.className = "inspector-meta";
        b.textContent = `Branch: ${branch}`;
        frag.appendChild(b);
      }
      if (changed.length > 0) {
        const h = document.createElement("div");
        h.className = "inspector-meta";
        h.textContent = "Changed files:";
        frag.appendChild(h);
        for (const f of changed) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "inspector-file-btn";
          btn.textContent = `${f.status} ${f.path}`;
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
              const r = await fetch(`/api/project/diff?path=${encodeURIComponent(f.path)}`);
              const d = await r.json();
              const pre = diffsEl.querySelector(".inspector-diff-detail");
              if (pre) pre.textContent = d.diff || d.staged || "(no textual diff)";
            } catch { /* ignore */ }
            finally { btn.disabled = false; }
          });
          frag.appendChild(btn);
        }
      }
      const pre = document.createElement("pre");
      pre.className = "inspector-pre inspector-diff-detail";
      pre.textContent = diff || status || (changed.length === 0 ? "No git changes detected." : "Select a file to view its diff.");
      frag.appendChild(pre);
      diffsEl.appendChild(frag);
      diffsEl.closest("[data-inspector-panel]")?.querySelector(".inspector-empty")?.toggleAttribute("hidden", true);
    }
    if (filesEl) {
      const files = Array.isArray(body?.files) ? body.files : [];
      const changed = Array.isArray(body?.changedFiles) ? body.changedFiles : [];
      const lines = [];
      if (changed.length > 0) {
        lines.push("Changed files:");
        lines.push(...changed.map((f) => ` ${f.status} ${f.path}`));
        lines.push("");
      }
      lines.push(files.length ? "Project files:" : "No project files yet.");
      lines.push(...files.map((f) => ` ${f.path} (${f.bytes} bytes)`));
      if (typeof executionStore !== "undefined") {
        const acts = executionStore.list();
        const turns = new Set(acts.map((a) => a.turnId).filter(Boolean));
        const last = acts[acts.length - 1];
        const model = typeof getActiveModelId === "function" ? getActiveModelId() : (document.getElementById("model-select")?.value || "");
        const mode = document.getElementById("chat-mode")?.value || "";
        lines.push("", "--- Execution metadata ---");
        if (model) lines.push(`Model: ${model}`);
        if (mode) lines.push(`Mode: ${mode}`);
        lines.push(`Chat running: ${typeof chatRunning !== "undefined" && chatRunning ? "yes" : "no"}`);
        lines.push(`Activities: ${acts.length}`);
        lines.push(`Turns: ${turns.size}`);
        if (body?.git?.branch) lines.push(`Git branch: ${body.git.branch}`);
        if (typeof body?.git?.changedCount === "number") lines.push(`Changed files: ${body.git.changedCount}`);
        if (last) lines.push(`Last: ${last.kind} [${last.state || ""}] ${last.ts || ""}`);
      }
      const text = lines.join("\n");
      filesEl.textContent = text;
      filesEl.closest("[data-inspector-panel]")?.querySelector(".inspector-empty")?.toggleAttribute("hidden", text.length > 0);
    }
    if (terminalEl && !terminalEl.textContent) {
      terminalEl.closest("[data-inspector-panel]")?.querySelector(".inspector-empty")?.toggleAttribute("hidden", false);
    }
    if (metaEl) {
      const lines = [];
      const model = typeof getActiveModelId === "function" ? getActiveModelId() : (document.getElementById("model-select")?.value || "");
      const mode = document.getElementById("chat-mode")?.value || "";
      if (model) lines.push(`Model: ${model}`);
      if (mode) lines.push(`Mode: ${mode}`);
      lines.push(`Chat running: ${typeof chatRunning !== "undefined" && chatRunning ? "yes" : "no"}`);
      if (body?.git?.branch) lines.push(`Git branch: ${body.git.branch}`);
      if (typeof body?.git?.changedCount === "number") lines.push(`Changed files: ${body.git.changedCount}`);
      if (typeof executionStore !== "undefined") {
        const acts = executionStore.list();
        const turns = new Set(acts.map((a) => a.turnId).filter(Boolean));
        const last = acts[acts.length - 1];
        lines.push(`Activities: ${acts.length}`);
        lines.push(`Turns: ${turns.size}`);
        if (last) {
          lines.push(`Last activity: ${last.kind}`);
          lines.push(`Last state: ${last.state || ""}`);
          lines.push(`Last time: ${last.ts || ""}`);
          if (last.turnId) lines.push(`Last turn: ${last.turnId}`);
        }
      }
      const text = lines.join("\n");
      metaEl.textContent = text;
      metaEl.closest("[data-inspector-panel]")?.querySelector(".inspector-empty")?.toggleAttribute("hidden", text.length > 0);
    }
  }

  async function refreshInspector() {
    try {
      const res = await fetch("/api/project/inspector");
      if (!res.ok) return;
      renderInspectorSnapshot(await res.json());
    } catch { /* best-effort */ }
  }

  window.setInspectorTab = (name) => {
    setTab(name);
    if (name === "diffs" || name === "files" || name === "meta") void refreshInspector();
  };
  document.getElementById("preview-reload")?.addEventListener("click", () => void refreshInspector());

  if (typeof executionStore !== "undefined") {
    let t = 0;
    let lastOutputSeq = 0;
    executionStore.subscribe(() => {
      const activities = executionStore.list();
      const last = activities[activities.length - 1];
      if (!last) return;
      if (last.kind === "file.changed" || last.kind === "diff.updated" || (last.kind === "tool.completed" && last.payload?.name === "write_file")) {
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => {
          t = 0;
          void refreshInspector();
          const pane = document.getElementById("preview-pane");
          const frame = document.getElementById("preview-frame");
          if (pane?.classList.contains("open") && frame && !frame.src.includes("about:blank")) {
            frame.src = `/preview/?t=${Date.now()}`;
          }
        }, 600);
      }
      if ((last.kind === "command.output" || last.kind === "test.output") && last.source !== "runner" && typeof last.seq === "number" && last.seq > lastOutputSeq) {
        lastOutputSeq = last.seq;
        const targetId = last.kind === "test.output" ? "inspector-tests" : "inspector-terminal";
        const term = document.getElementById(targetId);
        if (term) {
          const text = last.payload?.text || last.text || "";
          if (text) {
            term.textContent += text + "\n";
            term.scrollTop = term.scrollHeight;
            term.closest("[data-inspector-panel]")?.querySelector(".inspector-empty")?.toggleAttribute("hidden", true);
          }
        }
      }
    });
  }
})();

(() => {
  const modelEl = document.getElementById("session-model");
  const turnsEl = document.getElementById("session-turns");
  const actsEl = document.getElementById("session-activities");
  const statusEl = document.getElementById("session-status");
  if (!modelEl || !turnsEl || !actsEl || !statusEl) return;
  function refresh() {
    const model = typeof getActiveModelId === "function" ? getActiveModelId() : (document.getElementById("model-select")?.value || "");
    const short = model ? model.split("/").pop() || model : "-";
    modelEl.textContent = short;
    modelEl.title = model || "";
    if (typeof executionStore !== "undefined") {
      const acts = executionStore.list();
      const turns = new Set(acts.map((a) => a.turnId).filter(Boolean));
      turnsEl.textContent = String(turns.size);
      actsEl.textContent = String(acts.length);
    }
    const running = typeof chatRunning !== "undefined" && chatRunning;
    statusEl.textContent = running ? "Running" : "Idle";
    statusEl.dataset.tone = running ? "live" : "ok";
  }
  if (typeof executionStore !== "undefined") executionStore.subscribe(refresh);
  document.getElementById("model-select")?.addEventListener("change", refresh);
  window.addEventListener("studio:chat-state", refresh);
  setInterval(refresh, 2000);
  refresh();
})();

// --- saved sessions ---------------------------------------------------------
// The server owns the list; this renders titles and switches the active log.
// A session item is a real conversation, never a decorative history entry.
(() => {
  const listEl = document.getElementById("session-list");
  if (!listEl) return;

  const SESSION_ICON = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10v9H3z"/><path d="M5 6h6M5 8h4"/></svg>';
  let listEpoch = 0;

  function formatSessionTime(updatedAt) {
    if (typeof updatedAt !== "string") return "";
    const then = Date.parse(updatedAt);
    if (!Number.isFinite(then)) return "";
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderSessionList(body) {
    const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
    const active = typeof body?.activeId === "string" ? body.activeId : activeSessionId;
    activeSessionId = active;
    listEl.replaceChildren();
    for (const session of sessions) {
      if (typeof session?.id !== "string" || session.id.length === 0) continue;
      const title = typeof session.title === "string" && session.title.trim().length > 0
        ? session.title.trim()
        : "New session";
      const turns = typeof session.turns === "number" && Number.isFinite(session.turns) ? session.turns : 0;
      const isActive = session.id === active;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-item session-item";
      button.dataset.sessionId = session.id;
      button.title = `${title} · ${turns} turn${turns === 1 ? "" : "s"}`;
      if (isActive) {
        button.classList.add("is-active-session");
        button.setAttribute("aria-current", "true");
      }

      const icon = document.createElement("span");
      icon.className = "icon";
      icon.innerHTML = SESSION_ICON; // static brand geometry, never user data
      const label = document.createElement("span");
      label.className = "nav-label";
      label.textContent = title;
      const meta = document.createElement("span");
      meta.className = "session-item-meta";
      meta.textContent = formatSessionTime(session.updatedAt);

      button.append(icon, label, meta);
      button.addEventListener("click", () => {
        if (!isActive) void activateSession(session.id);
      });
      listEl.appendChild(button);
    }
    if (listEl.childElementCount === 0) {
      const empty = document.createElement("p");
      empty.className = "session-empty";
      empty.textContent = "No saved sessions yet.";
      listEl.appendChild(empty);
    }
  }

  async function refreshSessionList() {
    const epoch = ++listEpoch;
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (epoch !== listEpoch) return; // a newer refresh owns the list
      renderSessionList(body);
    } catch {
      // Keep the last good list: a transient read failure must not erase
      // sessions the user can still switch back to. Only the first load shows
      // the unavailable state.
      if (epoch === listEpoch && listEl.childElementCount === 0) {
        const empty = document.createElement("p");
        empty.className = "session-empty";
        empty.textContent = "Sessions unavailable.";
        listEl.appendChild(empty);
      }
    }
  }

  async function activateSession(id) {
    if (typeof id !== "string" || id.length === 0 || id === activeSessionId) return;
    if (chatRunning) {
      notify("Stop the current response before switching sessions.", "error");
      return;
    }
    if (typeof agentRunning !== "undefined" && agentRunning) {
      notify("Wait for the agent run to finish before switching sessions.", "error");
      return;
    }
    const res = await fetch("/api/sessions/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (res === null || !res.ok) {
      notify("Could not switch sessions.", "error");
      return;
    }
    activeSessionId = id;
    historyEpoch++; // a restore already in flight must not mix the two logs
    if (typeof executionStore !== "undefined") executionStore.reset();
    messagesEl.replaceChildren();
    if (typeof renderPlan === "function") renderPlan(null);
    showWelcome();
    await restoreHistory();
    closeMobileSidebar(false);
    await refreshSessionList();
  }

  window.refreshSessionList = refreshSessionList;
  void refreshSessionList();
})();
