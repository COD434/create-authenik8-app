/* Studio Web client (v0): BYOK key in memory only; SSE chat streaming. */

const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("new-chat");
const usageLine = document.getElementById("usage-line");

const history = []; // { role, content } — the key is never in here

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
      modelSelect.innerHTML = '<option>no free tool-capable models found</option>';
    } else {
      modelSelect.disabled = false;
      sendBtn.disabled = false;
    }
  } catch (error) {
    modelSelect.innerHTML = `<option>discovery failed</option>`;
    addMessage("system-error", `Model discovery: ${error.message}`);
  }
}

keyInput.addEventListener("change", loadModels);

newChatBtn.addEventListener("click", () => {
  history.length = 0;
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
  history.push({ role: "user", content: prompt });
  promptEl.value = "";
  sendBtn.disabled = true;

  const assistantEl = addMessage("assistant", "…");
  let firstDelta = true;
  let tokens = null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "X-OpenRouter-Key": key },
      body: JSON.stringify({ model, messages: history }),
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
          if (payload.usage !== undefined) tokens = payload.usage;
          if (payload.error !== undefined) throw new Error(payload.error);
        }
      }
    }

    if (firstDelta) assistantEl.textContent = "(empty response)";
    history.push({ role: "assistant", content: assistantEl.textContent });
    usageLine.textContent = tokens
      ? `${model} · ${tokens.totalTokens} tokens · ${tokens.costUsd === null ? "free tier" : `$${tokens.costUsd.toFixed(6)}`}`
      : `${model}`;
  } catch (error) {
    assistantEl.remove();
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
