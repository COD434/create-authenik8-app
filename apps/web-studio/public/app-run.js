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

function waitForChatIdle(timeoutMs = 4000) {
  if (!chatRunning) return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const finish = () => {
      window.removeEventListener("studio:chat-state", onState);
      window.clearTimeout(timer);
      resolve();
    };
    const onState = () => {
      if (!chatRunning) finish();
    };
    window.addEventListener("studio:chat-state", onState);
    timer = window.setTimeout(finish, timeoutMs);
  });
}

async function startNewSession() {
  closeMobileSidebar(false);
  historyEpoch++; // a restore already in flight must not repaint this state
  if (chatRunning) abortChat();
  await waitForChatIdle();
  // An empty conversation is already the new-chat state; creating a file for
  // every extra click would fill the sidebar with identical empty sessions.
  const hasActivity = typeof executionStore !== "undefined" && executionStore.list().length > 0;
  if (hasActivity) {
    const created = await fetch("/api/sessions", { method: "POST" }).catch(() => null);
    if (created === null || !created.ok) {
      notify("Could not start a new session.", "error");
      return;
    }
    const body = await created.json().catch(() => null);
    if (body && typeof body.id === "string") activeSessionId = body.id;
  }
  clearDraft();
  promptEl.value = "";
  promptEl.style.height = "auto";
  if (typeof executionStore !== "undefined") executionStore.reset();
  showWelcome(); // the greeting IS the new-chat state
  if (typeof window.refreshSessionList === "function") void window.refreshSessionList();
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

function createChatRunCtx({ endpoint, body, key, model }) {
  const timelineActive = !!window.STUDIO_EXECUTION_TIMELINE;
  const ctx = {
    endpoint, body, key, model, timelineActive,
    currentAssistant: timelineActive ? null : addMessage("assistant", ""),
    streamSource: "", streamRich: false, lastStreamRender: 0, usage: null,
    pendingDelta: "", renderFrame: 0, lastRound: 0, sawText: false, roundHasText: false,
    sawReasoning: false, sawReasoningThisRound: false, finished: false, outcome: "ok",
    blockSeq: 0, msgModel: null, activeTextBlock: null, activeThinkingBlock: null,
    reasoningBlock: null, reasoningBody: null, reasoningStartedAt: 0, reasoningTimer: 0, slowFrames: 0,
  };
  ctx.nextBlockId = () => "b_" + Date.now().toString(36) + "_" + (++ctx.blockSeq);
  ctx.msgModel = timelineActive ? null : { id: ctx.currentAssistant?.parentElement?.dataset.msgId ?? nextMsgId(), role: "assistant", status: "streaming", blocks: [] };
  ctx.attachMsgModel = () => { if (!ctx.timelineActive && ctx.msgModel && ctx.currentAssistant?.parentElement) ctx.currentAssistant.parentElement._msgModel = ctx.msgModel; };
  ctx.attachMsgModel();
  if (!timelineActive && ctx.currentAssistant) { ctx.currentAssistant.classList.add("thinking"); ctx.currentAssistant.setAttribute("aria-busy", "true"); }
  return ctx;
}

function finishAssistantText(ctx) {
  if (ctx.renderFrame !== 0) { cancelAnimationFrame(ctx.renderFrame); ctx.renderFrame = 0; }
  if (ctx.currentAssistant === null) { ctx.pendingDelta = ""; ctx.streamSource = ""; ctx.streamRich = false; return; }
  if (ctx.pendingDelta.length > 0) { ctx.streamSource += ctx.pendingDelta; ctx.pendingDelta = ""; autoScroll(); }
  if (ctx.timelineActive) { ctx.activeTextBlock = null; ctx.currentAssistant = null; ctx.streamSource = ""; ctx.streamRich = false; ctx.lastStreamRender = 0; return; }
  const wasStreaming = ctx.currentAssistant.classList.contains("streaming");
  ctx.currentAssistant.classList.remove("thinking", "streaming");
  if (wasStreaming) { const el = ctx.currentAssistant; el.classList.add("caret-fade"); window.setTimeout(() => el.classList.remove("caret-fade"), 120); }
  ctx.currentAssistant.removeAttribute("aria-busy");
  const finalSource = ctx.streamSource.length > 0 ? ctx.streamSource : ctx.currentAssistant.textContent;
  if (ctx.activeTextBlock) { ctx.activeTextBlock.status = "done"; ctx.activeTextBlock.text = finalSource; ctx.activeTextBlock = null; }
  if (finalSource.trim().length === 0) { if (ctx.msgModel) ctx.msgModel.status = "empty"; ctx.currentAssistant.parentElement?.remove(); }
  else { renderRichText(ctx.currentAssistant, finalSource); ctx.currentAssistant.dataset.rich = "true"; if (ctx.currentAssistant.textContent.trim().length === 0) { ctx.currentAssistant.parentElement?.remove(); } else { if (ctx.msgModel) ctx.msgModel.status = "done"; attachAssistantActions(ctx.currentAssistant, { regenerate: true }); ctx.attachMsgModel(); } }
  ctx.currentAssistant = null; ctx.streamSource = ""; ctx.streamRich = false; ctx.lastStreamRender = 0;
}

function startAssistantBlock(ctx) {
  ctx.currentAssistant = ctx.timelineActive ? document.createElement("div") : addMessage("assistant", "");
  if (!ctx.timelineActive) { ctx.currentAssistant.classList.add("thinking"); ctx.currentAssistant.setAttribute("aria-busy", "true"); if (ctx.currentAssistant.style.willChange === "") ctx.currentAssistant.style.willChange = "opacity, transform"; }
  ctx.streamSource = ""; ctx.streamRich = false; ctx.lastStreamRender = 0;
  ctx.msgModel = ctx.timelineActive ? null : { id: ctx.currentAssistant.parentElement?.dataset.msgId ?? nextMsgId(), role: "assistant", status: "streaming", blocks: [] };
  ctx.activeTextBlock = null; ctx.activeThinkingBlock = null; ctx.attachMsgModel();
}

function reasoningLabelText(ctx, final) {
  const seconds = Math.max(1, Math.round((Date.now() - ctx.reasoningStartedAt) / 1000));
  return final ? "Thought for " + seconds + "s" : "Thinking · " + seconds + "s";
}
function updateReasoningLabel(ctx, final) {
  if (ctx.reasoningBlock === null) return;
  const wrap = ctx.reasoningBlock.querySelector(".reasoning-label"); if (wrap === null) return;
  const activeKey = wrap.dataset.active === "b" ? "b" : "a"; const nextKey = activeKey === "a" ? "b" : "a";
  const active = wrap.querySelector(".rl-" + activeKey); const nextEl = wrap.querySelector(".rl-" + nextKey);
  if (!active || !nextEl) return;
  const next = reasoningLabelText(ctx, final); if (active.textContent === next) return;
  if (final) { nextEl.textContent = next; wrap.dataset.active = nextKey; nextEl.style.opacity = "1"; active.style.opacity = "0"; } else { active.textContent = next; }
}
function stopReasoningTimer(ctx) { if (ctx.reasoningTimer !== 0) { window.clearInterval(ctx.reasoningTimer); ctx.reasoningTimer = 0; } }
function ensureReasoningBlock(ctx) {
  if (ctx.reasoningBlock !== null) return;
  ctx.reasoningStartedAt = Date.now();
  ctx.reasoningBlock = document.createElement("div"); ctx.reasoningBlock.className = "reasoning-block streaming open";
  const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "reasoning-toggle"; toggle.setAttribute("aria-expanded", "true");
  toggle.innerHTML = '<svg class="icon chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="reasoning-label" data-active="a"><span class="rl rl-a">Thinking · 1s</span><span class="rl rl-b" aria-hidden="true"></span></span>'; // canon-ignore A8-SEC-08: static trusted markup, never user data
  toggle.addEventListener("click", () => { const open = ctx.reasoningBlock.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open)); });
  const reasoningWrap = document.createElement("div"); reasoningWrap.className = "reasoning-body";
  ctx.reasoningBody = document.createElement("div"); ctx.reasoningBody.className = "reasoning-body-inner";
  ctx.reasoningBody.addEventListener("scroll", () => { reasoningWrap.classList.toggle("scrolled", ctx.reasoningBody.scrollTop > 4); }, { passive: true });
  reasoningWrap.appendChild(ctx.reasoningBody); ctx.reasoningBlock.append(toggle, reasoningWrap);
  const row = ctx.currentAssistant?.parentElement; if (row?.parentElement === messagesEl) messagesEl.insertBefore(ctx.reasoningBlock, row); else messagesEl.appendChild(ctx.reasoningBlock);
  stopReasoningTimer(ctx); ctx.reasoningTimer = window.setInterval(() => updateReasoningLabel(ctx, false), 1000);
  ctx.activeThinkingBlock = { id: ctx.nextBlockId(), type: "thinking", status: "streaming", text: "" }; ctx.msgModel.blocks.push(ctx.activeThinkingBlock);
}
function appendReasoning(ctx, text) {
  if (chatMode !== "think" || typeof text !== "string" || text.length === 0 || ctx.roundHasText) return;
  ctx.sawReasoning = true; ctx.sawReasoningThisRound = true; if (ctx.timelineActive) return;
  ensureReasoningBlock(ctx);
  if (ctx.activeThinkingBlock) ctx.activeThinkingBlock.text += text;
  const parts = text.split("
");
  for (let i = 0; i < parts.length; i++) { if (i > 0) ctx.reasoningBody.appendChild(document.createTextNode("
")); const part = parts[i]; if (!part) continue; const chunk = document.createElement("span"); chunk.className = "reasoning-chunk"; chunk.textContent = part; ctx.reasoningBody.appendChild(chunk); }
  ctx.reasoningBody.scrollTop = ctx.reasoningBody.scrollHeight; autoScroll();
}
function finishReasoning(ctx) {
  if (ctx.timelineActive) { ctx.activeThinkingBlock = null; return; }
  if (ctx.reasoningBlock === null) return;
  stopReasoningTimer(ctx); updateReasoningLabel(ctx, true); ctx.reasoningBlock.classList.remove("streaming", "open");
  const toggle = ctx.reasoningBlock.querySelector(".reasoning-toggle"); if (toggle) toggle.setAttribute("aria-expanded", "false");
  if (ctx.activeThinkingBlock) { ctx.activeThinkingBlock.status = "done"; ctx.activeThinkingBlock.durationMs = Date.now() - ctx.reasoningStartedAt; }
  ctx.activeThinkingBlock = null; ctx.reasoningBlock = null; ctx.reasoningBody = null;
}

function flushDelta(ctx) {
  ctx.renderFrame = 0; if (ctx.pendingDelta.length === 0 || ctx.currentAssistant === null) return;
  ctx.streamSource += ctx.pendingDelta;
  if (!ctx.timelineActive) {
    if (ctx.activeTextBlock === null) { ctx.activeTextBlock = { id: ctx.nextBlockId(), type: "text", status: "streaming", text: "" }; if (ctx.msgModel) ctx.msgModel.blocks.push(ctx.activeTextBlock); }
    ctx.activeTextBlock.text = ctx.streamSource;
    if (ctx.currentAssistant.classList.contains("thinking")) { ctx.currentAssistant.classList.remove("thinking"); ctx.currentAssistant.classList.add("streaming"); }
  }
  ctx.pendingDelta = "";
  if (ctx.timelineActive) { autoScroll(); return; }
  const t0 = performance.now(); renderRichText(ctx.currentAssistant, ctx.streamSource); ctx.currentAssistant.dataset.rich = "true"; ctx.streamRich = true; autoScroll();
  const dt = performance.now() - t0; if (dt > 12) ctx.slowFrames++; else ctx.slowFrames = Math.max(0, ctx.slowFrames - 1);
  messagesEl.classList.toggle("perf-degraded", ctx.slowFrames >= 3);
  if (typeof window.studioPerf === "object" && window.studioPerf !== null) window.studioPerf.record(dt);
}
function queueDelta(ctx, delta) {
  ctx.sawText = true; if (ctx.currentAssistant === null) startAssistantBlock(ctx);
  if (!ctx.timelineActive && !ctx.roundHasText && chatMode === "think" && ctx.sawReasoningThisRound) { const row = ctx.currentAssistant.parentElement; if (row?.previousElementSibling?.classList.contains("reasoning-block")) row.dataset.answerLabel = "true"; }
  ctx.roundHasText = true;
  if (!ctx.timelineActive && ctx.currentAssistant.classList.contains("thinking")) { ctx.currentAssistant.textContent = ""; ctx.currentAssistant.classList.remove("thinking"); ctx.currentAssistant.classList.add("streaming"); }
  ctx.pendingDelta += delta; if (ctx.renderFrame === 0) ctx.renderFrame = requestAnimationFrame(() => flushDelta(ctx));
}

function handleToolStartEvent(ev, ctx) {
  finishAssistantText(ctx);
  if (!window.STUDIO_EXECUTION_TIMELINE) { const record = createToolRecord(ev.tool); (document.getElementById("messages") ?? document.getElementById("tools"))?.appendChild(record); const toolsEl = document.getElementById("tools"); if (toolsEl) toolsEl.hidden = true; }
  if (ctx.msgModel) { ctx.msgModel.blocks.push({ id: ev.tool.id || ctx.nextBlockId(), type: "tool_use", status: "running", name: ev.tool.name, arguments: ev.tool.arguments ?? "" }); ctx.attachMsgModel(); }
}
function handleToolEndEvent(ev, ctx) {
  if (ctx.msgModel) { const toolBlock = ctx.msgModel.blocks.find((b) => b.type === "tool_use" && b.id === ev.tool.id); if (toolBlock) { toolBlock.status = ev.tool.ok ? "done" : "failed"; toolBlock.summary = ev.tool.summary ?? ""; } ctx.attachMsgModel(); }
  if (ctx.timelineActive) return;
  const toolLine = document.querySelector('[data-tool-id="' + ev.tool.id + '"]'); if (toolLine === null) return;
  setToolRecord(toolLine, ev.tool);
  if (ev.tool.patches && ev.tool.patches.length > 0) { const patchesSection = document.createElement("div"); patchesSection.className = "diff-view"; renderDiffs(patchesSection, ev.tool.patches); toolLine.querySelector(".tool-body").appendChild(patchesSection); }
  if (typeof ev.tool.childId === "string") { const transcriptId = subagentLogId(ev.tool.name, ev.tool.childId); if (transcriptId !== null) { const link = document.createElement("button"); link.type = "button"; link.className = "tool-transcript-link"; link.textContent = "View transcript"; link.title = "Open transcript " + transcriptId; link.addEventListener("click", () => openSubagentTranscriptFromTool(transcriptId, link)); toolLine.querySelector(".tool-body").appendChild(link); } }
}
function handleErrorEvent(ev, ctx) {
  finishAssistantText(ctx); finishReasoning(ctx); ctx.outcome = "failed"; ctx.finished = true;
  const hasStudioError = Array.isArray(ev._payload?.studio) && ev._payload.studio.some((e) => e && e.kind === "error");
  if (!ctx.timelineActive || !hasStudioError) addMessage("system-error", ev.message);
}
function handleChatRunEvent(ev, ctx) {
  if (ev.type === "round") { if (ev.round <= ctx.lastRound || ev.round > 1) { finishReasoning(ctx); finishAssistantText(ctx); startAssistantBlock(ctx); ctx.roundHasText = false; ctx.sawReasoningThisRound = false; } ctx.lastRound = ev.round; }
  else if (ev.type === "reasoning") appendReasoning(ctx, ev.text);
  else if (ev.type === "delta") { finishReasoning(ctx); queueDelta(ctx, ev.text); }
  else if (ev.type === "tool_start") handleToolStartEvent(ev, ctx);
  else if (ev.type === "tool_end") handleToolEndEvent(ev, ctx);
  else if (ev.type === "plan") renderPlan(ev.plan);
  else if (ev.type === "usage") ctx.usage = ev.usage;
  else if (ev.type === "done") { ctx.finished = true; finishAssistantText(ctx); usageLine.textContent = ctx.usage ? ctx.model + " · " + ctx.usage.totalTokens + " tokens · " + (ctx.usage.costUsd === null ? "free tier" : "$" + ctx.usage.costUsd.toFixed(6)) : ctx.model; }
  else if (ev.type === "error") handleErrorEvent(ev, ctx);
  else if (ev.type === "note") { finishAssistantText(ctx); if (!window.STUDIO_EXECUTION_TIMELINE) addMessage("system", ev.text); }
  else if (ev.type === "compaction") { finishAssistantText(ctx); if (!window.STUDIO_EXECUTION_TIMELINE) addMessage("system", "Context compacted: " + ev.pruned + " older tool result" + (ev.pruned === 1 ? "" : "s") + " summarized to stay within the model budget."); }
}
function parseSsePayloadEvents(payload) {
  const events = [];
  if (typeof payload.round === "number") events.push({ type: "round", round: payload.round });
  if (payload.reasoning !== undefined) events.push({ type: "reasoning", text: payload.reasoning });
  if (payload.delta !== undefined) events.push({ type: "delta", text: payload.delta });
  if (payload.tool !== undefined) events.push({ type: payload.tool.phase === "start" ? "tool_start" : "tool_end", tool: payload.tool });
  if (payload.plan !== undefined) events.push({ type: "plan", plan: payload.plan });
  if (payload.usage !== undefined) events.push({ type: "usage", usage: payload.usage });
  if (payload.done === true) events.push({ type: "done" });
  if (payload.error !== undefined) events.push({ type: "error", message: typeof payload.error === "string" ? payload.error : "Generation failed.", _payload: payload });
  if (payload.note !== undefined) events.push({ type: "note", text: payload.note });
  if (payload.compaction !== undefined) events.push({ type: "compaction", pruned: payload.compaction.pruned });
  return events;
}
async function readChatSseStream(res, ctx) {
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); let boundary;
    while ((boundary = buffer.indexOf("

")) !== -1) {
      const rawEvent = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      for (const line of rawEvent.split("
")) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));
        if (Array.isArray(payload.studio) && typeof executionStore !== "undefined") executionStore.applyEvents(payload.studio);
        for (const ev of parseSsePayloadEvents(payload)) handleChatRunEvent(ev, ctx);
      }
    }
  }
}
function finalizeChatRun(ctx, error) {
  finishAssistantText(ctx); finishReasoning(ctx);
  if (error) {
    if (error instanceof Error && error.name === "AbortError") {
      ctx.outcome = "stopped"; if (ctx.msgModel) { ctx.msgModel.status = "stopped"; ctx.attachMsgModel(); }
      if (typeof executionStore !== "undefined") executionStore.settleRunning("cancelled");
      const stopped = addMessage("system", "Generation stopped. The conversation is saved up to the last received token.");
      if (!ctx.timelineActive) { const retry = document.createElement("button"); retry.type = "button"; retry.className = "msg-inline-action"; retry.dataset.action = "retry"; retry.textContent = "Regenerate"; retry.addEventListener("click", () => { if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse(); }); stopped.appendChild(document.createTextNode(" ")); stopped.appendChild(retry); }
    } else {
      ctx.outcome = "failed"; if (ctx.msgModel) { ctx.msgModel.status = "failed"; ctx.attachMsgModel(); }
      if (typeof executionStore !== "undefined") executionStore.settleRunning("failed");
      addMessage("system-error", error.message);
    }
    return;
  }
  if (!ctx.finished && typeof executionStore !== "undefined") executionStore.settleRunning("cancelled");
  if (!ctx.sawText && !ctx.sawReasoning) { if (!ctx.timelineActive) { const empty = addMessage("assistant", "(empty response)"); attachAssistantActions(empty, { regenerate: true }); } }
  else if (!ctx.finished && ctx.outcome === "ok") addMessage("system", "Response ended before completion. You can regenerate to try again.");
}

async function executeChatRequest({ endpoint, body, key, model }) {
  chatRunning = true; chatController = new AbortController(); syncChatControls(); setWorkspaceStatus("Generating", "live");
  closeComposerOptions(); historyEpoch++;
  const ctx = createChatRunCtx({ endpoint, body, key, model });
  announceStatus("Response started");
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "X-OpenRouter-Key": key }, body: JSON.stringify(body), signal: chatController.signal });
    if (!res.ok) { const resBody = await res.json().catch(() => ({ error: res.statusText })); throw new Error(resBody.error ?? "HTTP " + res.status); }
    await readChatSseStream(res, ctx);
    finalizeChatRun(ctx, null);
  } catch (error) {
    finalizeChatRun(ctx, error);
  } finally {
    if (ctx.renderFrame !== 0) { cancelAnimationFrame(ctx.renderFrame); ctx.renderFrame = 0; }
    chatRunning = false; chatController = null; messagesEl.classList.remove("perf-degraded"); syncChatControls();
    if (typeof window.refreshSessionList === "function") void window.refreshSessionList();
    promptEl.focus();
    if (ctx.outcome === "stopped") { setWorkspaceStatus("Stopped", "warn"); announceStatus("Response stopped"); }
    else if (ctx.outcome === "failed") { setWorkspaceStatus("Generation failed", "error"); announceStatus("Response failed"); }
    else { refreshIdleStatus(); announceStatus("Response finished"); }
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
      sessionId: activeSessionId, turnId: `turn_${Date.now().toString(36)}`, source: "system",
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

