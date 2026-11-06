/* Studio Web client (v1): BYOK key in memory only; SSE agent loop with sandboxed file tools. */

const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const messagesEl = document.getElementById("messages");
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

function addMessage(kind, text) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  autoScroll();
  return el;
}

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
  if (key.length === 0) return;
  modelSelect.disabled = true;
  try {
    const res = await fetch("/api/models", { headers: { "X-OpenRouter-Key": key } });
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
    }
  } catch (error) {
    modelSelect.innerHTML = "<option>discovery failed</option>";
    addMessage("system-error", `Model discovery: ${error.message}`);
  }
}

keyInput.addEventListener("change", loadModels);

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

document.getElementById("agent-btn").addEventListener("click", () => {
  if (agentRunning) return;
  agentOverlay.hidden = false;
  agentForm.hidden = false;
  agentStatus.hidden = true;
  document.getElementById("agent-brief").focus();
});

document.getElementById("agent-close").addEventListener("click", () => {
  if (!agentRunning) agentOverlay.hidden = true;
});
document.getElementById("agent-dismiss").addEventListener("click", () => {
  agentOverlay.hidden = true;
});

document.getElementById("agent-run").addEventListener("click", async () => {
  const brief = document.getElementById("agent-brief").value.trim();
  if (brief.length === 0 || agentRunning) return;
  agentRunning = true;
  agentRunBtn.disabled = true;
  agentForm.hidden = true;
  agentStatus.hidden = false;
  agentState.textContent = "Agent running — this can take minutes…";
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
        }
      }
    }

    if (doneEvent !== null) {
      agentState.textContent = doneEvent.ok
        ? `Agent finished in ${(doneEvent.durationMs / 1000).toFixed(0)}s — hit ▶ Preview to see the result.`
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

newChatBtn.addEventListener("click", async () => {
  await fetch("/api/reset", { method: "POST" }).catch(() => {});
  messagesEl.innerHTML = "";
  addMessage("assistant", "New chat. Describe what to build.");
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptEl.value.trim();
  const model = modelSelect.value;
  const key = apiKey();
  if (prompt.length === 0 || key.length === 0 || modelSelect.disabled) return;

  addMessage("user", prompt);
  promptEl.value = "";
  sendBtn.disabled = true;

  const assistantEl = addMessage("assistant", "…");
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
          if (payload.error !== undefined) throw new Error(payload.error);
        }
      }
    }

    if (firstDelta) assistantEl.textContent = "(empty response)";
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
