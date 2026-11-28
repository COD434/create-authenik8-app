// Command palette entries, filtering, and keyboard control.

// --- command palette --------------------------------------------------------

function paletteNewSessionEntry() {
  return {
    id: "new-session",
    title: "New session",
    detail: "Clear the conversation and start fresh",
    icon: PALETTE_ICONS.new,
    keywords: "reset chat clear start",
    run: () => { void startNewSession(); },
  };
}

function paletteTemplateEntry() {
  return {
    id: "template",
    title: "New from template",
    detail: "Generate a known Authenik8 project with the CLI",
    icon: PALETTE_ICONS.template,
    keywords: "scaffold starter auth oauth fullstack",
    run: () => openTemplate(document.getElementById("template-btn")),
  };
}

function paletteAiIntegrationEntry() {
  return {
    id: "ai-integration",
    title: "Plan an AI capability",
    detail: "Shape a feature around user tasks, business data, and access rules",
    icon: '<svg viewBox="0 0 16 16"><path d="M8 1.8v2.1M8 12.1v2.1M1.8 8h2.1m8.2 0h2.1"/><circle cx="8" cy="8" r="3.1"/></svg>',
    keywords: "ai integration rag knowledge tools actions provider",
    run: () => openAiIntegration(document.getElementById("ai-integration-btn")),
  };
}

function paletteAgentEntry() {
  return {
    id: "agent",
    title: "Build with agent",
    detail: "Hand a full project brief to OpenCode",
    icon: PALETTE_ICONS.agent,
    keywords: "opencode automate brief",
    run: () => openAgent(document.getElementById("agent-btn")),
  };
}

function paletteSubagentsEntry() {
  return {
    id: "subagents",
    title: "Subagent runs",
    detail: "Browse read-only explorer, reviewer, and builder transcripts",
    icon: PALETTE_ICONS.subagents,
    keywords: "transcript child explorer reviewer builder",
    run: () => openSubagents(),
  };
}

function palettePreviewEntry(previewOpen) {
  return {
    id: "preview",
    title: previewOpen ? "Hide project preview" : "Show project preview",
    detail: previewOpen ? "Return the workspace to the conversation" : "Inspect the sandbox in a viewport",
    icon: PALETTE_ICONS.preview,
    keywords: "viewport frame sandbox open close",
    run: () => {
      if (previewPane.classList.contains("open")) hidePreview();
      else showPreview();
    },
  };
}

function paletteRunEntry() {
  return {
    id: "run",
    title: "Run project",
    detail: "Install and start the sandbox project",
    icon: PALETTE_ICONS.run,
    keywords: "npm install start serve",
    run: () => { document.getElementById("run-btn").click(); },
  };
}

function paletteExportEntry() {
  return {
    id: "export",
    title: "Export project ZIP",
    detail: "Download the current sandbox",
    icon: PALETTE_ICONS.export,
    keywords: "download archive save",
    run: () => { document.getElementById("export-btn").click(); },
  };
}

function paletteShipEntry() {
  return {
    id: "ship",
    title: "Ship project",
    detail: "Connect Supabase or publish a static site to Vercel or Netlify",
    icon: PALETTE_ICONS.ship,
    keywords: "deploy publish host supabase vercel netlify database",
    run: () => openShip(paletteOpenBtn),
  };
}

function paletteBuildEntries(previewOpen) {
  return [
    paletteNewSessionEntry(),
    paletteTemplateEntry(),
    paletteAiIntegrationEntry(),
    paletteAgentEntry(),
    paletteSubagentsEntry(),
    palettePreviewEntry(previewOpen),
    paletteRunEntry(),
    paletteExportEntry(),
    paletteShipEntry(),
  ];
}

function paletteWorkspaceEntries(hasKey) {
  return [
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
      id: "quit-studio",
      title: "Quit Studio",
      detail: "Stop the local Studio server on this machine",
      icon: PALETTE_ICONS.quit,
      keywords: "exit close shutdown stop server",
      run: () => { void quitStudio(); },
    },
  ];
}

function paletteAppearanceEntries(collapsed, drawerOpen) {
  return [
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
}

function paletteEntriesFor() {
  const previewOpen = previewPane.classList.contains("open");
  const hasKey = apiKey().length > 0;
  const collapsed = !mobileQuery.matches && appShell.dataset.sidebar === "collapsed";
  const drawerOpen = appShell.classList.contains("sidebar-open");
  const entries = [
    ...paletteBuildEntries(previewOpen),
    ...paletteWorkspaceEntries(hasKey),
    ...paletteAppearanceEntries(collapsed, drawerOpen),
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
    icon.innerHTML = entry.icon; // canon-ignore A8-SEC-08: static local SVG, never user data
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

