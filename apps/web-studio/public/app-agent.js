// Build-with-agent modal and its streamed run.

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
  if (!aiIntegrationOverlay.hidden) {
    closeAiIntegration();
    return;
  }
  if (!subagentsOverlay.hidden) {
    closeSubagents();
    return;
  }
  if (!codeRabbitOverlay.hidden) {
    closeCodeRabbit();
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
    if (doneEvent !== null && doneEvent.ok) {
      showPreview(); // refresh the preview pane with what the agent built
    }
  }
});

