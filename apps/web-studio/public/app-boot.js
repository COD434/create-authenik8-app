// Stop control and initial state. Loaded last.

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

// --- assistant mode toggle (Think / Plan / Build / Debug) --------------------

const modeButtons = [...document.querySelectorAll(".mode-btn")];
function setChatMode(mode) {
  chatMode = mode;
  for (const button of modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
for (const button of modeButtons) {
  button.addEventListener("click", () => setChatMode(button.dataset.mode ?? "build"));
}
setChatMode("build");

// --- initial state ----------------------------------------------------------

applyTheme(currentThemeChoice(), false);
syncSidebarControls();
syncKeyState();
syncChatControls();
refreshIdleStatus();
