/* Authenik8 client (v1): BYOK key in memory only; SSE agent loop with sandboxed file tools. */

const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const composer = document.getElementById("composer");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("new-chat");
const usageLine = document.getElementById("usage-line");

function apiKey() {
  return keyInput.value.trim();
}

function autoScroll() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// The compact brand mark for assistant avatars: the real logo geometry,
// trimmed of the dot grid and glow that only read at large sizes.
const AVATAR_SVG = '<svg class="avatar" width="26" height="26" viewBox="0 0 680 680" aria-hidden="true"><circle cx="340" cy="340" r="240" fill="#246a43"/><circle cx="340" cy="340" r="240" fill="none" stroke="#39c978" stroke-width="34"/><polygon points="226 490 262 490 342 260 322 260" fill="#f7fff9"/><polygon points="356 260 336 260 418 490 454 490" fill="#f7fff9"/><rect x="270" y="388" width="98" height="32" rx="5" fill="#f7fff9"/><rect x="360" y="262" width="92" height="96" rx="36" fill="#a7dfbf"/><rect x="354" y="362" width="102" height="112" rx="42" fill="#a7dfbf"/><rect x="358" y="349" width="94" height="22" rx="5" fill="#a7dfbf"/></svg>';

function addMessage(kind, text) {
  welcomeEl.hidden = true; // any message replaces the empty state
  if (kind === "assistant") {
    const row = document.createElement("div");
    row.className = "msg-row assistant-row";
    row.innerHTML = AVATAR_SVG; // static brand markup, never user data
    const el = document.createElement("div");
    el.className = "msg assistant";
    el.textContent = text;
    row.appendChild(el);
    messagesEl.appendChild(row);
    autoScroll();
    return el;
  }
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  autoScroll();
  return el;
}

function showWelcome() {
  messagesEl.innerHTML = "";
  welcomeEl.hidden = false;
}

// Pull code or answers out of a finished reply without selecting text.
function attachCopyButton(bubble) {
  const row = bubble.parentElement;
  if (row === null || !row.classList.contains("msg-row")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "msg-copy";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(bubble.textContent);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Blocked";
    }
    window.setTimeout(() => { btn.textContent = "Copy"; }, 1200);
  });
  row.appendChild(btn);
}

// Client-side errors must surface in-band: a silently broken UI is the
// worst failure mode a local tool can have (it is how a stuck modal went
// undiagnosed for a session).
window.addEventListener("error", (event) => {
  addMessage("system-error", `Client error: ${event.message}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "unknown");
  addMessage("system-error", `Client error: ${reason}`);
});

function addToolLine(name) {
  const el = document.createElement("div");
  el.className = "msg tool-line";
  el.textContent = `⚙ ${name} …`;
  messagesEl.appendChild(el);
  autoScroll();
  return el;
}

async function loadModels() {
  const key = apiKey();
  modelSelect.disabled = true;
  try {
    // Zero-key browsing: the catalog is public data. A key only upgrades the
    // request to the entitlement-aware path.
    const headers = key.length > 0 ? { "X-OpenRouter-Key": key } : {};
    const res = await fetch("/api/models", { headers });
    if (!res.ok) throw new Error((await res.json()).error ?? "model discovery failed");
    const body = await res.json();
    modelSelect.innerHTML = "";
    for (const model of body.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = `${model.name} (${Math.round((model.contextLength ?? 0) / 1000)}k)`;
      modelSelect.appendChild(option);
    }
    if (body.models.length === 0) {
      modelSelect.innerHTML = "<option>no free tool-capable models found</option>";
    } else {
      modelSelect.disabled = false;
      sendBtn.disabled = false;
      const note = document.getElementById("model-note");
      if (note !== null) note.textContent = `${body.models.length} free · no key to browse`;
      // Default to the auto-router when present: some free models behind
      // agents-only providers 403 app traffic — a broken zero-click default
      // must never be the entry experience.
      if (body.models.some((model) => model.id === "openrouter/free")) {
        modelSelect.value = "openrouter/free";
      }
    }
  } catch (error) {
    modelSelect.innerHTML = "<option>discovery failed</option>";
    addMessage("system-error", `Model discovery: ${error.message}`);
  }
}

keyInput.addEventListener("change", loadModels);
// Browse immediately on load, with no key anywhere in the flow.
void loadModels();

const previewPane = document.getElementById("preview-pane");
const previewFrame = document.getElementById("preview-frame");

function showPreview() {
  previewPane.classList.add("open");
  previewPane.setAttribute("aria-hidden", "false");
  previewFrame.src = `/preview/?t=${Date.now()}`;
}

function hidePreview() {
  previewPane.classList.remove("open");
  previewPane.setAttribute("aria-hidden", "true");
  previewFrame.src = "about:blank";
}

document.getElementById("preview-btn").addEventListener("click", () => {
  if (previewPane.classList.contains("open")) hidePreview();
  else showPreview();
});

document.getElementById("preview-reload").addEventListener("click", showPreview);
document.getElementById("preview-close").addEventListener("click", hidePreview);

// --- Build with agent (user-triggered only) ---

const agentOverlay = document.getElementById("agent-overlay");
const agentForm = document.getElementById("agent-form");
const agentStatus = document.getElementById("agent-status");
const agentState = document.getElementById("agent-state");
const agentOutput = document.getElementById("agent-output");
const agentRunBtn = document.getElementById("agent-run");
let agentRunning = false;

function openAgent() {
  agentOverlay.hidden = false;
  if (agentRunning) return; // a running agent keeps its live status view
  agentForm.hidden = false;
  agentStatus.hidden = true;
  document.getElementById("agent-brief").focus();
}

document.getElementById("agent-btn").addEventListener("click", openAgent);

document.getElementById("agent-close").addEventListener("click", () => {
  // Closing the dialog is ALWAYS allowed: it never aborts the run (closing
  // the page does), and a stuck busy-flag must never trap the user.
  agentOverlay.hidden = true;
});
document.getElementById("agent-dismiss").addEventListener("click", () => {
  agentOverlay.hidden = true;
});

// The modal must be dismissible in every conventional way: clicking the
// backdrop outside the dialog, and Escape (agent first, then run panel).
agentOverlay.addEventListener("mousedown", (event) => {
  if (event.target === agentOverlay) agentOverlay.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!agentOverlay.hidden) {
    agentOverlay.hidden = true;
    return;
  }
  if (!templateOverlay.hidden) {
    templateOverlay.hidden = true;
    return;
  }
  const runOverlay = document.getElementById("run-overlay");
  if (!runOverlay.hidden) runOverlay.hidden = true;
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

document.getElementById("agent-run").addEventListener("click", async () => {
  const brief = document.getElementById("agent-brief").value.trim();
  if (brief.length === 0 || agentRunning) return;
  agentRunning = true;
  agentRunBtn.disabled = true;
  agentForm.hidden = true;
  agentStatus.hidden = false;
  agentState.textContent = "Agent running, this can take minutes…";
  agentOutput.textContent = "";

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
    }
  } catch (error) {
    agentState.textContent = `Agent error: ${error.message}`;
  } finally {
    agentRunning = false;
    agentRunBtn.disabled = false;
    showPreview(); // refresh the preview pane with whatever the agent built
  }
});

// --- New from template (the Authenik8 CLI bridge) ---

const templateOverlay = document.getElementById("template-overlay");
const templateForm = document.getElementById("template-form");
const templateStatus = document.getElementById("template-status");
const templateState = document.getElementById("template-state");
const templateOutput = document.getElementById("template-output");
const templateRunBtn = document.getElementById("template-run");
let templateBusy = false;

const MAX_TEMPLATE_LINES = 300;
function appendTemplateLine(line) {
  const lines = templateOutput.textContent === "" ? [] : templateOutput.textContent.split("\n");
  if (lines[0] === "…") lines.shift();
  lines.push(line);
  if (lines.length > MAX_TEMPLATE_LINES) {
    lines.splice(0, lines.length - MAX_TEMPLATE_LINES);
    lines.unshift("…");
  }
  templateOutput.textContent = lines.join("\n");
  templateOutput.scrollTop = templateOutput.scrollHeight;
}

function syncTemplateRows() {
  const preset = document.getElementById("template-preset").value;
  document.getElementById("template-frontend-row").hidden = preset !== "fullstack";
  document.getElementById("template-providers-row").hidden = preset !== "auth-oauth";
  if (preset === "fullstack") {
    // The CLI's own contract: fullstack requires PostgreSQL.
    document.getElementById("template-database").value = "postgresql";
  }
}
document.getElementById("template-preset").addEventListener("change", syncTemplateRows);

function openTemplate() {
  templateOverlay.hidden = false;
  if (templateBusy) return; // a running generation keeps its live status view
  templateForm.hidden = false;
  templateStatus.hidden = true;
  syncTemplateRows();
}

document.getElementById("template-btn").addEventListener("click", openTemplate);

// Starter prompts on the empty state: two fill the composer, two open the
// real doors (the template wizard and the agent) in one click.
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (chip.dataset.open === "template") { openTemplate(); return; }
    if (chip.dataset.open === "agent") { openAgent(); return; }
    promptEl.value = chip.dataset.prompt ?? "";
    promptEl.style.height = "auto";
    promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
    promptEl.focus();
  });
});
document.getElementById("template-close").addEventListener("click", () => {
  // Always allowed: hiding the dialog never cancels the generation, and a
  // stuck busy-flag must never trap the user.
  templateOverlay.hidden = true;
});
document.getElementById("template-dismiss").addEventListener("click", () => {
  templateOverlay.hidden = true;
});
templateOverlay.addEventListener("mousedown", (event) => {
  if (event.target === templateOverlay) templateOverlay.hidden = true;
});

templateRunBtn.addEventListener("click", async () => {
  if (templateBusy) return;
  const preset = document.getElementById("template-preset").value;
  const spec = {
    preset,
    database: document.getElementById("template-database").value,
    packageManager: document.getElementById("template-package-manager").value,
    usePrisma: document.getElementById("template-prisma").checked,
    confirm: true, // the modal itself is the explicit replacement warning
  };
  if (preset === "fullstack") spec.frontend = document.getElementById("template-frontend").value;
  if (preset === "auth-oauth") {
    const providers = [];
    if (document.getElementById("template-oauth-google").checked) providers.push("google");
    if (document.getElementById("template-oauth-github").checked) providers.push("github");
    spec.oauthProviders = providers;
  }

  templateBusy = true;
  templateRunBtn.disabled = true;
  templateForm.hidden = true;
  templateStatus.hidden = false;
  templateState.textContent = "Generating with the Authenik8 CLI. Runs locally, nothing is uploaded…";
  templateOutput.textContent = "";

  try {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const body = await res.json();
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let seeded = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine === undefined) continue;
        const payload = JSON.parse(dataLine.slice(6));
        if (payload.template !== undefined) {
          const t = payload.template;
          if (t.phase === "line") appendTemplateLine(t.line);
          if (t.phase === "seeded") seeded = t;
        }
        if (payload.error !== undefined) throw new Error(payload.error);
        if (payload.done === true && seeded !== null) {
          messagesEl.innerHTML = "";
          addMessage(
            "assistant",
            `Sandbox seeded from the Authenik8 template (${seeded.files} files). Describe changes in chat, or hit Run project to install and start it.`,
          );
          templateOverlay.hidden = true;
        }
      }
    }
    if (seeded === null && templateState.textContent !== "") {
      // Stream ended without seeded/error: the server closed early.
      throw new Error("Template stream ended before seeding completed.");
    }
  } catch (error) {
    templateState.textContent = `Template failed: ${error.message}`;
  } finally {
    if (templateState.textContent.startsWith("Template failed") || templateState.textContent === "") {
      templateState.textContent = templateState.textContent; // keep error visible
    } else {
      templateState.textContent = "Seeded.";
    }
    templateBusy = false;
    templateRunBtn.disabled = false;
  }
});

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
    if (!runOverlay.hidden) runState.textContent = "The project is running. Stop is right below.";
    return;
  }
  runOverlay.hidden = false;
  startRun();
});

document.getElementById("run-close").addEventListener("click", () => {
  runOverlay.hidden = true; // hiding does NOT stop the project
});

async function startRun() {
  runOutput.textContent = "";
  runState.textContent = "Starting…";
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
          if (payload.runOut !== undefined) {
            runOutput.textContent += `${payload.runOut}\n`;
            runOutput.scrollTop = runOutput.scrollHeight;
          }
          if (payload.run?.phase === "install") runState.textContent = "Installing dependencies…";
          if (payload.run?.phase === "serve") {
            runState.textContent = "Project running. Previewing it on the right.";
            showPreview(); // the whole point: test the app the moment it serves
            // The panel has done its job: get it out of the way. A click on
            // Run project toggles it back open for output review / Stop.
            window.setTimeout(() => { runOverlay.hidden = true; }, 1400);
          }
          if (payload.run?.phase === "exited") runState.textContent = `Project exited (code ${payload.run.code ?? "killed"}).`;
          if (payload.run?.phase === "failed") runState.textContent = `Run failed: ${payload.run.message ?? "unknown"}`;
        }
      }
    }
  } catch (error) {
    runState.textContent = `Run error: ${error.message}`;
  }
}

document.getElementById("run-start").addEventListener("click", startRun);

document.getElementById("run-stop").addEventListener("click", async () => {
  await fetch("/api/run/stop", { method: "POST" }).catch(() => {});
  runState.textContent = "Stop requested…";
});

function askForKey() {
  keyInput.classList.add("attention");
  keyInput.focus();
  addMessage(
    "system",
    "One step to start building: create a free OpenRouter key at openrouter.ai/keys (no card needed, free tier gives you 50 requests a day) and paste it in the sidebar. It stays in this tab's memory only. Then send again.",
  );
}

keyInput.addEventListener("input", () => {
  keyInput.classList.remove("attention");
});

newChatBtn.addEventListener("click", async () => {
  await fetch("/api/reset", { method: "POST" }).catch(() => {});
  showWelcome(); // the greeting IS the new-chat state
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptEl.value.trim();
  const model = modelSelect.value;
  const key = apiKey();
  if (prompt.length === 0 || modelSelect.disabled) return;
  if (key.length === 0) {
    // The build is the product; the key is one 30-second step, asked for
    // exactly when it is needed — never as a gate in front of the app.
    askForKey();
    return;
  }

  addMessage("user", prompt);
  promptEl.value = "";
  promptEl.style.height = "auto";
  sendBtn.disabled = true;

  const assistantEl = addMessage("assistant", "");
  assistantEl.classList.add("thinking"); // three dots until the first token
  let firstDelta = true;
  let usage = null;
  let toolLine = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "X-OpenRouter-Key": key },
      body: JSON.stringify({ model, message: prompt }),
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
          if (payload.delta !== undefined) {
            if (firstDelta) {
              assistantEl.textContent = "";
              assistantEl.classList.remove("thinking");
              firstDelta = false;
            }
            assistantEl.textContent += payload.delta;
            autoScroll();
          }
          if (payload.tool !== undefined) {
            if (payload.tool.phase === "start") {
              toolLine = addToolLine(payload.tool.name);
            } else if (toolLine !== null) {
              toolLine.textContent = `⚙ ${payload.tool.name} ${payload.tool.ok ? "✓" : "✗"} ${payload.tool.summary}`;
              toolLine = null;
            }
          }
          if (payload.usage !== undefined) usage = payload.usage;
          if (payload.done === true) {
            usageLine.textContent = usage
              ? `${model} · ${usage.totalTokens} tokens · ${usage.costUsd === null ? "free tier" : `$${usage.costUsd.toFixed(6)}`}`
              : model;
          }
          if (payload.note !== undefined) addMessage("system", payload.note);
          if (payload.error !== undefined) throw new Error(payload.error);
        }
      }
    }

    if (firstDelta) {
      assistantEl.classList.remove("thinking");
      assistantEl.textContent = "(empty response)";
    } else {
      attachCopyButton(assistantEl);
    }
  } catch (error) {
    if (firstDelta) assistantEl.remove();
    addMessage("system-error", error.message);
  } finally {
    sendBtn.disabled = modelSelect.disabled;
    promptEl.focus();
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
