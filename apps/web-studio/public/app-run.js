// Project run overlay and new-session reset.

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

function applyRunEvent(payload) {
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

async function startRun() {
  const confirmed = window.confirm("Run this project's dependency installation and build/start scripts as your Windows account? Project code can access your files, environment, and network. Only run projects you trust.");
  if (!confirmed) return;
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
          applyRunEvent(payload);
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
              const record = createToolRecord(payload.tool);
              const toolsEl = document.getElementById("tools");
              if (toolsEl !== null) {
                toolsEl.appendChild(record);
                toolsEl.hidden = false;
              }
            } else {
              const toolsEl = document.getElementById("tools");
              if (toolsEl !== null) {
                const line = toolsEl.querySelector(
                  `[data-tool-id="${payload.tool.id}"]`
                );
                if (line !== null) {
                  setToolRecord(line, payload.tool);
                  if (payload.tool.patches && payload.tool.patches.length > 0) {
                    const patchesSection = document.createElement("div");
                    patchesSection.className = "diff-view";
                    renderDiffs(patchesSection, payload.tool.patches);
                    line.querySelector(".tool-body").appendChild(patchesSection);
                  }
                  if (typeof payload.tool.childId === "string") {
                    const transcriptId = subagentLogId(
                      payload.tool.name,
                      payload.tool.childId
                    );
                    if (transcriptId !== null) {
                      const link = document.createElement("button");
                      link.type = "button";
                      link.className = "tool-transcript-link";
                      link.textContent = "View transcript";
                      link.title = `Open transcript ${transcriptId}`;
                      link.addEventListener("click", () =>
                        openSubagentTranscriptFromTool(transcriptId, link)
                      );
                      line.querySelector(".tool-body").appendChild(link);
                    }
                  }
                }
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

