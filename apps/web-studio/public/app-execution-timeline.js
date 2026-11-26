// Store-driven execution timeline (StudioEvent v1).
// Renders normalized activities as compact cards. Additive during migration.

(() => {
  const root = document.getElementById("execution-timeline");
  if (!root || typeof executionStore === "undefined") return;

  const enabledByQuery = new URLSearchParams(window.location.search).get("timeline") === "1";
  const enabledByStorage = (() => {
    try { return window.localStorage.getItem("authenik8-execution-timeline") === "1"; } catch { return false; }
  })();
  const enabled = enabledByQuery || enabledByStorage || true; // visible during migration
  window.STUDIO_EXECUTION_TIMELINE = enabled;
  if (enabled) document.querySelector(".chat")?.setAttribute("data-timeline", "1");

  function labelFor(activity) {
    const name = typeof activity.payload?.name === "string" ? activity.payload.name : "";
    switch (activity.kind) {
      case "user.message": return "You";
      case "assistant.message.started":
      case "assistant.message.delta":
      case "assistant.message.completed": return "Assistant";
      case "reasoning.started":
      case "reasoning.delta":
      case "reasoning.completed": return "Reasoning";
      case "tool.started":
      case "tool.completed":
      case "tool.failed": return name ? `Tool: ${name}` : "Tool";
      case "command.started":
      case "command.output":
      case "command.completed": return name ? `Command: ${name}` : "Command";
      case "file.changed": return "File changed";
      case "diff.updated": return "Diff updated";
      case "plan.updated": return "Plan updated";
      case "approval.requested": return "Approval requested";
      case "approval.resolved": return "Approval resolved";
      case "test.started":
      case "test.output":
      case "test.completed": return name ? `Test: ${name}` : "Test";
      case "error": return "Error";
      case "notice": return activity.payload?.type === "compaction" ? "Compaction" : "Notice";
      case "turn.started":
      case "turn.completed":
      case "turn.failed":
      case "turn.cancelled": return "Turn";
      default: return String(activity.kind);
    }
  }

  function textFor(activity) {
    if (activity.kind === "user.message") return activity.payload?.text || "";
    if (activity.kind.startsWith("assistant.message")) return activity.text || "";
    if (activity.kind.startsWith("reasoning")) return activity.reasoning || "";
    if (activity.kind.startsWith("tool")) return activity.payload?.summary || activity.payload?.arguments || activity.text || "";
    if (activity.kind.startsWith("command") || activity.kind.startsWith("test")) {
      const t = activity.text || activity.payload?.text || activity.payload?.message || "";
      if (activity.kind === "command.started" && !t) return activity.payload?.phase ? `Phase: ${activity.payload.phase}` : "Running...";
      if (activity.kind === "command.completed" && !t) {
        const code = activity.payload?.code;
        const ok = activity.payload?.ok;
        if (code !== undefined || ok !== undefined) return `Exit ${code ?? (ok ? 0 : "unknown")}${ok === false ? " (failed)" : ""}`;
      }
      if (activity.kind === "test.started" && !t) return "Running tests...";
      if (activity.kind === "test.completed" && !t) return activity.state === "failed" ? "Tests failed" : "Tests completed";
      return t;
    }
    if (activity.kind === "file.changed") return activity.payload?.path || activity.payload?.text || activity.payload?.message || "";
    if (activity.kind === "notice") return activity.payload?.message || (activity.payload?.type === "compaction" ? `Compacted ${activity.payload?.pruned ?? "?"} tool results` : "");
    if (activity.kind === "error") return activity.payload?.message || "Error";
    if (activity.kind === "approval.requested") return activity.payload?.message || activity.payload?.reason || "Approval requested (runtime action not available in this interface).";
    if (activity.kind === "approval.resolved") return activity.payload?.message || activity.payload?.resolution || "Approval resolved.";
    if (activity.kind === "plan.updated") {
      const p = activity.payload?.plan || activity.payload?.steps || activity.payload?.message;
      if (typeof p === "string") return p;
      if (Array.isArray(p)) return p.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join("\n");
      return "Plan updated";
    }
    if (activity.kind === "diff.updated") {
      return activity.payload?.summary || activity.payload?.path || "Diff updated";
    }
    if (activity.kind.startsWith("turn.")) {
      if (activity.kind === "turn.started") return "Turn started";
      if (activity.kind === "turn.completed") return "Turn completed";
      if (activity.kind === "turn.failed") return activity.payload?.errorMessage || "Turn failed";
      if (activity.kind === "turn.cancelled") return "Turn cancelled";
      return activity.kind;
    }
    return activity.text || "";
  }

  function hasDetails(activity) {
    return activity.payload?.raw !== undefined || Array.isArray(activity.payload?.patches) || activity.payload?.arguments !== undefined;
  }

  function renderDetails(activity) {
    const details = document.createElement("details");
    details.className = "exec-details";
    const summary = document.createElement("summary");
    summary.textContent = activity.payload?.untrusted ? "Details (untrusted raw)" : "Details";
    details.appendChild(summary);
    const pre = document.createElement("pre");
    pre.className = "exec-pre";
    const raw = activity.payload?.raw ?? activity.payload?.patches ?? activity.payload?.arguments ?? activity.payload;
    try {
      pre.textContent = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    } catch {
      pre.textContent = String(raw);
    }
    details.appendChild(pre);
    return details;
  }

  function makeAction(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exec-action";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderActions(activity, isLastAssistant) {
    const actions = document.createElement("div");
    actions.className = "exec-actions";
    if (activity.kind === "user.message") {
      actions.appendChild(makeAction("Copy", async () => {
        try { await navigator.clipboard.writeText(activity.payload?.text || ""); } catch {}
      }));
      actions.appendChild(makeAction("Edit", () => {
        if (typeof chatRunning !== "undefined" && chatRunning) return;
        if (typeof promptEl !== "undefined" && promptEl) {
          promptEl.value = activity.payload?.text || "";
          promptEl.style.height = "auto";
          promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
          promptEl.focus();
          if (typeof saveDraft === "function") saveDraft();
        }
      }));
    } else if (activity.kind.startsWith("assistant.message")) {
      actions.appendChild(makeAction("Copy", async () => {
        try { await navigator.clipboard.writeText(activity.text || ""); } catch {}
      }));
      if (isLastAssistant) {
        const regen = makeAction("Regenerate", () => {
          if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
        });
        regen.disabled = typeof chatRunning !== "undefined" && chatRunning;
        actions.appendChild(regen);
      }
    } else if (activity.kind === "error") {
      const retry = makeAction("Retry", () => {
        if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
      });
      retry.disabled = typeof chatRunning !== "undefined" && chatRunning;
      actions.appendChild(retry);
    } else if (activity.kind === "file.changed" && typeof activity.payload?.path === "string" && activity.payload.path) {
      actions.appendChild(makeAction("Open diff", async () => {
        const pane = document.getElementById("preview-pane"); if (pane && !pane.classList.contains("open")) { pane.classList.add("open"); pane.setAttribute("aria-hidden","false"); } if (typeof window.setInspectorTab === "function") window.setInspectorTab("diffs");
        try {
          const r = await fetch(`/api/project/diff?path=${encodeURIComponent(activity.payload.path)}`);
          const d = await r.json();
          const pre = document.querySelector("#inspector-diffs .inspector-diff-detail");
          if (pre) pre.textContent = d.diff || d.staged || "(no textual diff)";
        } catch { /* ignore */ }
      }));
    } else if (activity.kind === "approval.requested") {
      const approve = makeAction("Approve", () => {});
      approve.disabled = true;
      approve.title = "Approval actions are not available in this runtime";
      const reject = makeAction("Reject", () => {});
      reject.disabled = true;
      reject.title = "Approval actions are not available in this runtime";
      actions.appendChild(approve);
      actions.appendChild(reject);
    }
    return actions.childElementCount > 0 ? actions : null;
  }

  function nearBottom(el, threshold = 96) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }
  function render() {
    const head = document.getElementById("execution-timeline-head");
    const statusEl = document.getElementById("execution-timeline-status");
    if (!enabled) { root.hidden = true; if (head) head.hidden = true; return; }
    const activities = executionStore.list();
    if (activities.length === 0) {
      const welcomeVisible = document.getElementById("welcome")?.hidden === false;
      root.hidden = welcomeVisible;
      if (head) head.hidden = true;
      root.replaceChildren();
      if (!welcomeVisible) {
        const empty = document.createElement("div");
        empty.className = "exec-empty";
        empty.textContent = "Execution activity will appear here.";
        root.appendChild(empty);
      }
      return;
    }
    const shouldStick = nearBottom(root);
    root.hidden = false;
    if (head) head.hidden = false;
    if (statusEl) {
      const running = typeof chatRunning !== "undefined" && chatRunning;
      statusEl.textContent = running ? "Running" : "Idle";
      statusEl.dataset.tone = running ? "live" : "ok";
    }

    let lastAssistantId = null;
    for (let i = activities.length - 1; i >= 0; i--) {
      if (String(activities[i].kind).startsWith("assistant.message")) { lastAssistantId = activities[i].id; break; }
    }

    const frag = document.createDocumentFragment();
    for (const activity of activities.slice(-120)) {
      const card = document.createElement("article");
      card.className = "exec-card";
      card.dataset.activityId = activity.id;
      card.dataset.kind = activity.kind;
      card.dataset.state = activity.state || "";

      const head = document.createElement("div");
      head.className = "exec-head";
      const label = document.createElement("span");
      label.className = "exec-label";
      label.textContent = labelFor(activity);
      const state = document.createElement("span");
      state.className = "exec-state";
      state.dataset.state = activity.state || "";
      state.textContent = activity.state || "";
      head.append(label, state);

      const body = document.createElement("div");
      body.className = "exec-body";
      const text = textFor(activity);
      if (activity.kind.startsWith("assistant.message") && typeof renderRichText === "function" && text.trim().length > 0) {
        body.classList.add("rich");
        renderRichText(body, text);
      } else {
        body.textContent = text.length > 600 ? `${text.slice(0, 600)}…` : text;
      }
      if (body.textContent.length === 0 && !body.querySelector(".md")) body.hidden = true;

      card.append(head, body);
      if (hasDetails(activity)) card.appendChild(renderDetails(activity));
      const actions = renderActions(activity, activity.id === lastAssistantId);
      if (actions) card.appendChild(actions);
      frag.appendChild(card);
    }
    root.replaceChildren(frag);
    if (shouldStick) root.scrollTop = root.scrollHeight;
    if (typeof updateJumpLatest === "function") updateJumpLatest();
  }

  executionStore.subscribe(render);
  render();
})();
