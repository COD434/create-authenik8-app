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

