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

// --- initial state ----------------------------------------------------------

applyTheme(currentThemeChoice(), false);
syncSidebarControls();
syncKeyState();
syncChatControls();
refreshIdleStatus();
