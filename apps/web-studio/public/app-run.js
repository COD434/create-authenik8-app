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
  if (Array.isArray(payload.studio) && typeof executionStore !== "undefined") {
    executionStore.applyEvents(payload.studio);
  }
  if (payload.runOut !== undefined) {
    runOutput.textContent += `${payload.runOut}\n`;
    runOutput.scrollTop = runOutput.scrollHeight;
    const insp = document.getElementById("inspector-terminal");
    if (insp) { insp.textContent += `${payload.runOut}\n`; insp.scrollTop = insp.scrollHeight; }
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
  const inspTerm = document.getElementById("inspector-terminal");
  if (inspTerm) inspTerm.textContent = "";
  const inspTests = document.getElementById("inspector-tests");
  if (inspTests) inspTests.textContent = "";
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
  clearDraft();
  promptEl.value = "";
  promptEl.style.height = "auto";
  if (typeof executionStore !== "undefined") executionStore.reset();
  await fetch("/api/reset", { method: "POST" }).catch(() => {});
  showWelcome(); // the greeting IS the new-chat state
}

newChatBtn.addEventListener("click", () => { void startNewSession(); });

function removeLastAssistantTurnFromUI() {
  if (window.STUDIO_EXECUTION_TIMELINE && typeof executionStore !== "undefined") {
    // The timeline owns the transcript in this mode. Keep the prompt and
    // drop only the answer/tool activity that regeneration replaces.
    executionStore.truncateAfterLastUser();
    return;
  }
  const rows = [...messagesEl.children];
  let lastUserIndex = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].classList?.contains("user")) { lastUserIndex = i; break; }
  }
  if (lastUserIndex >= 0) {
    for (let i = rows.length - 1; i > lastUserIndex; i -= 1) rows[i].remove();
  }
}

async function executeChatRequest({ endpoint, body, key, model }) {
  chatRunning = true;
  chatController = new AbortController();
  syncChatControls();
  setWorkspaceStatus("Generating", "live");
  closeComposerOptions();
  historyEpoch++; // the live turn owns the transcript from here

  const timelineActive = !!window.STUDIO_EXECUTION_TIMELINE;
  let currentAssistant = timelineActive ? document.createElement("div") : addMessage("assistant", "");
  if (!timelineActive) {
    currentAssistant.classList.add("thinking"); // three dots until the first token
    currentAssistant.setAttribute("aria-busy", "true");
  }
  announceStatus("Response started");
  let streamSource = "";
  let lastStreamRender = 0;
  let streamRich = false;
  let usage = null;
  let pendingDelta = "";
  let renderFrame = 0;
  let lastRound = 0;
  let sawText = false;
  let roundHasText = false;
  let sawReasoningThisRound = false;
  let finished = false;
  let outcome = "ok";
  let blockSeq = 0;
  const nextBlockId = () => `b_${Date.now().toString(36)}_${++blockSeq}`;
  let msgModel = timelineActive ? null : { id: currentAssistant.parentElement?.dataset.msgId ?? nextMsgId(), role: "assistant", status: "streaming", blocks: [] };
  let activeTextBlock = null;
  let activeThinkingBlock = null;
  const attachMsgModel = () => {
    if (timelineActive || msgModel === null) return;
    const row = currentAssistant?.parentElement;
    if (row) row._msgModel = msgModel;
  };
  attachMsgModel();

  const finishCurrentAssistant = () => {
    if (renderFrame !== 0) {
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
    }
    if (currentAssistant === null) {
      pendingDelta = "";
      streamSource = "";
      streamRich = false;
      return;
    }
    if (pendingDelta.length > 0) {
      streamSource += pendingDelta;
      pendingDelta = "";
      autoScroll();
    }
    if (timelineActive) {
      activeTextBlock = null;
      currentAssistant = null;
      streamSource = "";
      streamRich = false;
      lastStreamRender = 0;
      return;
    }
    const wasStreaming = currentAssistant.classList.contains("streaming");
    currentAssistant.classList.remove("thinking", "streaming");
    if (wasStreaming) {
      const el = currentAssistant;
      el.classList.add("caret-fade");
      window.setTimeout(() => el.classList.remove("caret-fade"), 120);
    }
    currentAssistant.removeAttribute("aria-busy");
    const finalSource = streamSource.length > 0 ? streamSource : currentAssistant.textContent;
    if (activeTextBlock) { activeTextBlock.status = "done"; activeTextBlock.text = finalSource; activeTextBlock = null; }
    if (finalSource.trim().length === 0) {
      if (msgModel) msgModel.status = "empty";
      currentAssistant.parentElement?.remove();
    } else {
      renderRichText(currentAssistant, finalSource);
      currentAssistant.dataset.rich = "true";
      if (currentAssistant.textContent.trim().length === 0) {
        if (msgModel) msgModel.status = "empty";
        currentAssistant.parentElement?.remove();
      } else {
        if (msgModel) msgModel.status = "done";
        attachAssistantActions(currentAssistant, { regenerate: true });
        attachMsgModel();
      }
    }
    currentAssistant = null;
    streamSource = "";
    streamRich = false;
    lastStreamRender = 0;
  };

  const startAssistant = () => {
    currentAssistant = timelineActive ? document.createElement("div") : addMessage("assistant", "");
    if (!timelineActive) {
      currentAssistant.classList.add("thinking");
      currentAssistant.setAttribute("aria-busy", "true");
      if (currentAssistant.style.willChange === "") currentAssistant.style.willChange = "opacity, transform";
    }
    streamSource = "";
    streamRich = false;
    lastStreamRender = 0;
    msgModel = timelineActive ? null : { id: currentAssistant.parentElement?.dataset.msgId ?? nextMsgId(), role: "assistant", status: "streaming", blocks: [] };
    activeTextBlock = null;
    activeThinkingBlock = null;
    attachMsgModel();
  };

  // Collapsible "Thinking" block: reasoning streams in here, collapsed by
  // default, and is finalized (streaming dot removed) when the answer starts.
  let reasoningBlock = null;
  let reasoningBody = null;
  let reasoningStartedAt = 0;
  let reasoningTimer = 0;
  let sawReasoning = false;
  const reasoningLabel = () => {
    const seconds = Math.max(1, Math.round((Date.now() - reasoningStartedAt) / 1000));
    return `Thought for ${seconds}s`;
  };
  const updateReasoningLabel = (final = false) => {
    if (reasoningBlock === null) return;
    const wrap = reasoningBlock.querySelector(".reasoning-label");
    if (wrap === null) return;
    const activeKey = wrap.dataset.active === "b" ? "b" : "a";
    const nextKey = activeKey === "a" ? "b" : "a";
    const active = wrap.querySelector(`.rl-${activeKey}`);
    const nextEl = wrap.querySelector(`.rl-${nextKey}`);
    if (!active || !nextEl) return;
    const next = final ? reasoningLabel() : `Thinking · ${Math.max(1, Math.round((Date.now() - reasoningStartedAt) / 1000))}s`;
    if (active.textContent === next) return;
    if (final) {
      nextEl.textContent = next;
      wrap.dataset.active = nextKey;
      nextEl.style.opacity = "1";
      active.style.opacity = "0";
    } else {
      active.textContent = next;
    }
  };
  const stopReasoningTimer = () => {
    if (reasoningTimer !== 0) {
      window.clearInterval(reasoningTimer);
      reasoningTimer = 0;
    }
  };
  const appendReasoning = (text) => {
    if (chatMode !== "think" || typeof text !== "string" || text.length === 0 || roundHasText) return;
    sawReasoning = true;
    sawReasoningThisRound = true;
    if (timelineActive) return; // store already receives reasoning events via payload.studio
    if (reasoningBlock === null) {
      reasoningStartedAt = Date.now();
      reasoningBlock = document.createElement("div");
      reasoningBlock.className = "reasoning-block streaming open";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "reasoning-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.innerHTML = '<svg class="icon chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="reasoning-label" data-active="a"><span class="rl rl-a">Thinking · 1s</span><span class="rl rl-b" aria-hidden="true"></span></span>';
      toggle.addEventListener("click", () => {
        const open = reasoningBlock.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      const reasoningWrap = document.createElement("div");
      reasoningWrap.className = "reasoning-body";
      reasoningBody = document.createElement("div");
      reasoningBody.className = "reasoning-body-inner";
      reasoningBody.addEventListener("scroll", () => {
        reasoningWrap.classList.toggle("scrolled", reasoningBody.scrollTop > 4);
      }, { passive: true });
      reasoningWrap.appendChild(reasoningBody);
      reasoningBlock.append(toggle, reasoningWrap);
      const row = currentAssistant?.parentElement;
      if (row?.parentElement === messagesEl) messagesEl.insertBefore(reasoningBlock, row);
      else messagesEl.appendChild(reasoningBlock);
      stopReasoningTimer();
      reasoningTimer = window.setInterval(() => updateReasoningLabel(false), 1000);
      activeThinkingBlock = { id: nextBlockId(), type: "thinking", status: "streaming", text: "" };
      msgModel.blocks.push(activeThinkingBlock);
    }
    if (activeThinkingBlock) activeThinkingBlock.text += text;
    const parts = text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) reasoningBody.appendChild(document.createTextNode("\n"));
      const part = parts[i];
      if (!part) continue;
      const chunk = document.createElement("span");
      chunk.className = "reasoning-chunk";
      chunk.textContent = part;
      reasoningBody.appendChild(chunk);
    }
    reasoningBody.scrollTop = reasoningBody.scrollHeight;
    autoScroll();
  };
  const finishReasoning = () => {
    if (timelineActive) { activeThinkingBlock = null; return; }
    if (reasoningBlock !== null) {
      stopReasoningTimer();
      updateReasoningLabel(true);
      reasoningBlock.classList.remove("streaming", "open");
      const toggle = reasoningBlock.querySelector(".reasoning-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (activeThinkingBlock) { activeThinkingBlock.status = "done"; activeThinkingBlock.durationMs = Date.now() - reasoningStartedAt; }
      activeThinkingBlock = null;
      reasoningBlock = null;
      reasoningBody = null;
    }
  };

  let slowFrames = 0;
  const perfTimeline = [];
  const flushDelta = () => {
    renderFrame = 0;
    if (pendingDelta.length === 0 || currentAssistant === null) return;
    streamSource += pendingDelta;
    if (!timelineActive) {
      if (activeTextBlock === null) {
        activeTextBlock = { id: nextBlockId(), type: "text", status: "streaming", text: "" };
        if (msgModel) msgModel.blocks.push(activeTextBlock);
      }
      activeTextBlock.text = streamSource;
      if (currentAssistant.classList.contains("thinking")) {
        currentAssistant.classList.remove("thinking");
        currentAssistant.classList.add("streaming");
      }
    }
    pendingDelta = "";
    if (timelineActive) {
      autoScroll();
      return;
    }
    const t0 = performance.now();
    renderRichText(currentAssistant, streamSource);
    currentAssistant.dataset.rich = "true";
    streamRich = true;
    autoScroll();
    const dt = performance.now() - t0;
    if (dt > 12) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    messagesEl.classList.toggle("perf-degraded", slowFrames >= 3);
    if (typeof window.studioPerf === "object" && window.studioPerf !== null) window.studioPerf.record(dt);
  };

  const queueDelta = (delta) => {
    sawText = true;
    if (currentAssistant === null) startAssistant();
    if (!timelineActive && !roundHasText && chatMode === "think" && sawReasoningThisRound) {
      // Small distinction between reasoning and the answer, mirroring trace order.
      const row = currentAssistant.parentElement;
      if (row?.previousElementSibling?.classList.contains("reasoning-block")) {
        row.dataset.answerLabel = "true";
      }
    }
    roundHasText = true;
    if (!timelineActive && currentAssistant.classList.contains("thinking")) {
      currentAssistant.textContent = "";
      currentAssistant.classList.remove("thinking");
      currentAssistant.classList.add("streaming");
    }
    pendingDelta += delta;
    if (renderFrame === 0) renderFrame = requestAnimationFrame(flushDelta);
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "X-OpenRouter-Key": key },
      body: JSON.stringify(body),
      signal: chatController.signal,
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(resBody.error ?? `HTTP ${res.status}`);
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
          if (Array.isArray(payload.studio) && typeof executionStore !== "undefined") {
            executionStore.applyEvents(payload.studio);
          }
          const events = [];
          if (typeof payload.round === "number") events.push({ type: "round", round: payload.round });
          if (payload.reasoning !== undefined) events.push({ type: "reasoning", text: payload.reasoning });
          if (payload.delta !== undefined) events.push({ type: "delta", text: payload.delta });
          if (payload.tool !== undefined) events.push({ type: payload.tool.phase === "start" ? "tool_start" : "tool_end", tool: payload.tool });
          if (payload.plan !== undefined) events.push({ type: "plan", plan: payload.plan });
          if (payload.usage !== undefined) events.push({ type: "usage", usage: payload.usage });
          if (payload.done === true) events.push({ type: "done" });
          if (payload.error !== undefined) events.push({ type: "error", message: typeof payload.error === "string" ? payload.error : "Generation failed." });
          if (payload.note !== undefined) events.push({ type: "note", text: payload.note });
          if (payload.compaction !== undefined) events.push({ type: "compaction", pruned: payload.compaction.pruned });

          for (const ev of events) {
            if (ev.type === "round") {
              // A fresh model round gets its own assistant block, so prose that
              // follows tool output never backfills above the tool line. A retry
              // can restart at round 1, which also starts a fresh block.
              if (ev.round <= lastRound || ev.round > 1) {
                finishReasoning();
                finishCurrentAssistant();
                startAssistant();
                roundHasText = false;
                sawReasoningThisRound = false;
              }
              lastRound = ev.round;
            } else if (ev.type === "reasoning") {
              appendReasoning(ev.text);
            } else if (ev.type === "delta") {
              finishReasoning();
              queueDelta(ev.text);
            } else if (ev.type === "tool_start") {
              finishCurrentAssistant();
              if (!window.STUDIO_EXECUTION_TIMELINE) {
                const record = createToolRecord(ev.tool);
                (document.getElementById("messages") ?? document.getElementById("tools"))?.appendChild(record);
                const toolsEl = document.getElementById("tools");
                if (toolsEl) toolsEl.hidden = true;
              }
              if (msgModel) {
                msgModel.blocks.push({ id: ev.tool.id || nextBlockId(), type: "tool_use", status: "running", name: ev.tool.name, arguments: ev.tool.arguments ?? "" });
                attachMsgModel();
              }
            } else if (ev.type === "tool_end") {
              if (msgModel) {
                const toolBlock = msgModel.blocks.find((b) => b.type === "tool_use" && b.id === ev.tool.id);
                if (toolBlock) { toolBlock.status = ev.tool.ok ? "done" : "failed"; toolBlock.summary = ev.tool.summary ?? ""; }
                attachMsgModel();
              }
              if (!timelineActive) {
                const toolLine = document.querySelector(`[data-tool-id="${ev.tool.id}"]`);
                if (toolLine !== null) {
                  setToolRecord(toolLine, ev.tool);
                  if (ev.tool.patches && ev.tool.patches.length > 0) {
                    const patchesSection = document.createElement("div");
                    patchesSection.className = "diff-view";
                    renderDiffs(patchesSection, ev.tool.patches);
                    toolLine.querySelector(".tool-body").appendChild(patchesSection);
                  }
                  if (typeof ev.tool.childId === "string") {
                    const transcriptId = subagentLogId(ev.tool.name, ev.tool.childId);
                    if (transcriptId !== null) {
                      const link = document.createElement("button");
                      link.type = "button";
                      link.className = "tool-transcript-link";
                      link.textContent = "View transcript";
                      link.title = `Open transcript ${transcriptId}`;
                      link.addEventListener("click", () => openSubagentTranscriptFromTool(transcriptId, link));
                      toolLine.querySelector(".tool-body").appendChild(link);
                    }
                  }
                }
              }
            } else if (ev.type === "plan") {
              renderPlan(ev.plan);
            } else if (ev.type === "usage") {
              usage = ev.usage;
            } else if (ev.type === "done") {
              finished = true;
              finishCurrentAssistant();
              usageLine.textContent = usage
                ? `${model} · ${usage.totalTokens} tokens · ${usage.costUsd === null ? "free tier" : `$${usage.costUsd.toFixed(6)}`}`
                : model;
            } else if (ev.type === "error") {
              finishCurrentAssistant();
              finishReasoning();
              outcome = "failed";
              finished = true;
              addMessage("system-error", ev.message);
            } else if (ev.type === "note") {
              finishCurrentAssistant();
              if (!window.STUDIO_EXECUTION_TIMELINE) addMessage("system", ev.text);
            } else if (ev.type === "compaction") {
              finishCurrentAssistant();
              if (!window.STUDIO_EXECUTION_TIMELINE) addMessage("system", `Context compacted: ${ev.pruned} older tool result${ev.pruned === 1 ? "" : "s"} summarized to stay within the model budget.`);
            }
          }
        }
      }
    }

    if (!finished) finishCurrentAssistant();
    finishReasoning();
    if (!finished && typeof executionStore !== "undefined") {
      // A dropped stream must not leave a card looking live forever.
      executionStore.settleRunning("cancelled");
    }
    if (!sawText && !sawReasoning) {
      if (!timelineActive) {
        const empty = addMessage("assistant", "(empty response)");
        attachAssistantActions(empty, { regenerate: true });
      }
    } else if (!finished && outcome === "ok") {
      addMessage("system", "Response ended before completion. You can regenerate to try again.");
    }
  } catch (error) {
    finishCurrentAssistant();
    finishReasoning();
    if (error instanceof Error && error.name === "AbortError") {
      outcome = "stopped";
      if (msgModel) { msgModel.status = "stopped"; attachMsgModel(); }
      if (typeof executionStore !== "undefined") executionStore.settleRunning("cancelled");
      const stopped = addMessage("system", "Generation stopped. The conversation is saved up to the last received token.");
      if (!timelineActive) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "msg-inline-action";
        retry.dataset.action = "retry";
        retry.textContent = "Regenerate";
        retry.addEventListener("click", () => {
          if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
        });
        stopped.appendChild(document.createTextNode(" "));
        stopped.appendChild(retry);
      }
    } else {
      outcome = "failed";
      if (msgModel) { msgModel.status = "failed"; attachMsgModel(); }
      if (typeof executionStore !== "undefined") executionStore.settleRunning("failed");
      addMessage("system-error", error.message);
    }
  } finally {
    if (renderFrame !== 0) {
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
    }
    chatRunning = false;
    chatController = null;
    messagesEl.classList.remove("perf-degraded");
    syncChatControls();
    promptEl.focus();
    if (outcome === "stopped") {
      setWorkspaceStatus("Stopped", "warn");
      announceStatus("Response stopped");
    } else if (outcome === "failed") {
      setWorkspaceStatus("Generation failed", "error");
      announceStatus("Response failed");
    } else {
      refreshIdleStatus();
      announceStatus("Response finished");
    }
  }
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (chatRunning) return;
  const prompt = promptEl.value.trim();
  const model = modelSelect.value;
  const key = apiKey();
  if (prompt.length === 0 || modelSelect.disabled) return;
  if (key.length === 0) {
    askForKey();
    return;
  }

  addMessage("user", prompt);
  if (typeof executionStore !== "undefined") {
    executionStore.applyEvent({
      v: 1, id: `se_user_${Date.now().toString(36)}`, seq: Date.now(), ts: new Date().toISOString(),
      sessionId: "local-session", turnId: `turn_${Date.now().toString(36)}`, source: "system",
      kind: "user.message", activityId: `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
      state: "completed", payload: { text: prompt }
    });
  }
  promptEl.value = "";
  promptEl.style.height = "auto";
  clearDraft();
  await executeChatRequest({
    endpoint: "/api/chat",
    body: { model, message: prompt, mode: chatMode },
    key,
    model,
  });
});

window.regenerateLastResponse = async function regenerateLastResponse() {
  if (chatRunning) return;
  const model = modelSelect.value;
  const key = apiKey();
  if (modelSelect.disabled) return;
  if (key.length === 0) {
    askForKey();
    return;
  }
  removeLastAssistantTurnFromUI();
  await executeChatRequest({
    endpoint: "/api/chat/regenerate",
    body: { model, mode: chatMode },
    key,
    model,
  });
};

promptEl.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
    return;
  }
  if (event.key === "ArrowUp" && promptEl.value.trim().length === 0) {
    let previous = null;
    if (window.STUDIO_EXECUTION_TIMELINE && typeof executionStore !== "undefined") {
      const activities = executionStore.list();
      for (let i = activities.length - 1; i >= 0; i -= 1) {
        if (activities[i].kind === "user.message") { previous = activities[i].payload?.text ?? ""; break; }
      }
    } else {
      const userRows = messagesEl.querySelectorAll(".msg-row.user .msg.user");
      const last = userRows[userRows.length - 1];
      if (last) previous = last.textContent ?? "";
    }
    if (previous !== null) {
      event.preventDefault();
      promptEl.value = previous;
      promptEl.style.height = "auto";
      promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
      promptEl.setSelectionRange(promptEl.value.length, promptEl.value.length);
      saveDraft();
    }
    return;
  }
  if (event.key === "Escape" && chatRunning) {
    const openOverlay = document.querySelector(".overlay:not([hidden]), .modal-backdrop:not([hidden])");
    if (!openOverlay) {
      event.preventDefault();
      stopBtn.click();
    }
  }
});

// Auto-grow the composer with its content (CSS caps it at 180px).
promptEl.addEventListener("input", () => {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
});

