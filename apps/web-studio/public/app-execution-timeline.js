// Store-driven execution timeline (StudioEvent v1).
// Renders normalized activities as compact, incrementally updated cards.

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

  const ICONS = {
    user: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.2" r="2.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.3 13.3c.5-2.5 2.4-4 4.7-4s4.2 1.5 4.7 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    assistant: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 13.8 13.4H2.2L8 2.2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.6 10.2h4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    reasoning: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 9.3 5.5 13 6.8 9.3 8.1 8 11.8 6.7 8.1 3 6.8 6.7 5.5 8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12.4 10.6 13 12.2 14.6 12.8 13 13.4 12.4 15 11.8 13.4 10.2 12.8 11.8 12.2 12.4 10.6Z" fill="currentColor"/></svg>',
    tool: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.4 2.4a3.1 3.1 0 0 0-3.8 4L2.6 9.4a1.7 1.7 0 0 0 2.4 2.4l3-3a3.1 3.1 0 0 0 3.9-3.8L10.2 6.7l-1.9-.4-.4-1.9 1.5-2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    command: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m4.6 6.2 2 1.8-2 1.8M8.6 10.4h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    test: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m5.1 8.2 1.9 1.9 3.9-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    file: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.9h5.1L13 5.8v8.3H4V1.9Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.1 1.9v3.9H13M6.2 9.2h4.6M8.5 6.9v4.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    plan: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.4 4.2h7.2M5.4 8h7.2M5.4 11.8h7.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="3.1" cy="4.2" r="0.8" fill="currentColor"/><circle cx="3.1" cy="8" r="0.8" fill="currentColor"/><circle cx="3.1" cy="11.8" r="0.8" fill="currentColor"/></svg>',
    notice: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m8 2.2 5.6 2.8L8 7.8 2.4 5 8 2.2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m3 8.2 5 2.5 5-2.5M3 11.3l5 2.5 5-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    approval: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.1 13 4v3.8c0 2.8-2 4.9-5 6.1-3-1.2-5-3.3-5-6.1V4l5-1.9Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m5.7 8.1 1.6 1.6 3.1-3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 14 13H2L8 2.2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.1v3.1M8 11.1h.01" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    dot: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>',
  };

  const REASONING_PREFIX = "reasoning.";
  const ASSISTANT_PREFIX = "assistant.message";
  const HIDDEN_PREFIXES = ["turn."];
  const cards = new Map();

  function isReasoning(activity) {
    return String(activity.kind).startsWith(REASONING_PREFIX);
  }
  function isAssistant(activity) {
    return String(activity.kind).startsWith(ASSISTANT_PREFIX);
  }
  function isTerminal(activity) {
    return activity.state === "completed" || activity.state === "failed" || activity.state === "cancelled";
  }
  function isLive(activity) {
    return activity.state === "running" || activity.state === "queued";
  }

  function humanize(value) {
    if (typeof value !== "string" || value.length === 0) return "";
    const spaced = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return spaced.length === 0 ? "" : spaced[0].toUpperCase() + spaced.slice(1);
  }

  function compactToolArgs(activity) {
    const raw = typeof activity.payload?.arguments === "string" ? activity.payload.arguments : "";
    if (raw.length === 0) return "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof parsed.path === "string") {
        const size = typeof parsed.content === "string" ? ` (${parsed.content.length} chars)` : "";
        return `${parsed.path}${size}`;
      }
      const keys = Object.keys(parsed ?? {}).slice(0, 3);
      if (keys.length > 0) return keys.map((key) => `${key}=${String(parsed[key]).slice(0, 40)}`).join(" ");
    } catch { /* fall through to truncation */ }
    return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  }

  function iconFor(activity) {
    if (isAssistant(activity)) {
      if (typeof AVATAR_SVG === "string") return AVATAR_SVG;
      return ICONS.assistant;
    }
    if (isReasoning(activity)) return ICONS.reasoning;
    const kind = String(activity.kind);
    if (kind === "user.message") return ICONS.user;
    if (kind.startsWith("tool.")) return ICONS.tool;
    if (kind.startsWith("command.")) return ICONS.command;
    if (kind.startsWith("test.")) return ICONS.test;
    if (kind === "file.changed" || kind === "diff.updated") return ICONS.file;
    if (kind === "plan.updated") return ICONS.plan;
    if (kind === "approval.requested" || kind === "approval.resolved") return ICONS.approval;
    if (kind === "error") return ICONS.error;
    if (kind === "notice") return ICONS.notice;
    return ICONS.dot;
  }

  function toneFor(activity) {
    if (activity.state === "failed" || activity.kind === "error") return "danger";
    if (activity.state === "awaiting_approval") return "warning";
    if (isLive(activity)) return "accent";
    if (isReasoning(activity)) return "muted";
    if (activity.kind === "user.message") return "muted";
    if (activity.state === "completed") return "success";
    return "muted";
  }

  function reasoningLabel(activity) {
    if (isLive(activity)) return "Thinking";
    const ms = activity.durationMs;
    if (typeof ms === "number" && ms >= 1000) {
      return `Thought for ${Math.max(1, Math.round(ms / 1000))}s`;
    }
    return "Reasoning";
  }

  function titleFor(activity) {
    if (isAssistant(activity)) return "Assistant";
    if (isReasoning(activity)) return reasoningLabel(activity);
    const kind = String(activity.kind);
    if (kind === "user.message") return "You";
    if (kind.startsWith("tool.")) return humanize(activity.payload?.name) || "Tool";
    if (kind.startsWith("command.")) return "Command";
    if (kind.startsWith("test.")) return "Tests";
    if (kind === "file.changed") return "Changed file";
    if (kind === "diff.updated") return "Diff";
    if (kind === "plan.updated") return "Plan";
    if (kind === "notice") return activity.payload?.type === "compaction" ? "Context compacted" : "Notice";
    if (kind === "error") return "Error";
    if (kind === "approval.requested") return "Approval requested";
    if (kind === "approval.resolved") return "Approval resolved";
    return humanize(kind) || "Activity";
  }

  function subtitleFor(activity) {
    const kind = String(activity.kind);
    if (kind.startsWith("tool.")) return compactToolArgs(activity);
    if (kind.startsWith("command.") || kind.startsWith("test.")) {
      return typeof activity.payload?.name === "string" ? activity.payload.name : "";
    }
    if (kind === "file.changed" || kind === "diff.updated") {
      if (typeof activity.payload?.path === "string") return activity.payload.path;
      if (typeof activity.payload?.summary === "string") return activity.payload.summary;
    }
    if (kind === "approval.requested" || kind === "approval.resolved") {
      if (typeof activity.payload?.reason === "string") return activity.payload.reason;
    }
    return "";
  }

  function stateLabel(activity) {
    if (isAssistant(activity) || isReasoning(activity)) {
      if (activity.state === "running" || activity.state === "queued") {
        return isReasoning(activity) ? "Thinking" : "Streaming";
      }
      if (activity.state === "failed") return "Failed";
      if (activity.state === "cancelled") return "Stopped";
      return "";
    }
    if (activity.state === "running" || activity.state === "queued") return activity.state === "queued" ? "Queued" : "Running";
    if (activity.state === "awaiting_approval") return "Approval";
    if (activity.state === "failed") return "Failed";
    if (activity.state === "cancelled") return "Stopped";
    return "";
  }

  function formatPlan(plan) {
    if (typeof plan === "string") return plan;
    if (Array.isArray(plan)) {
      return plan.map((step) => {
        if (typeof step === "string") return step;
        if (step && typeof step === "object") {
          const title = typeof step.title === "string" ? step.title : typeof step.step === "string" ? step.step : JSON.stringify(step);
          return typeof step.status === "string" ? `[${step.status}] ${title}` : title;
        }
        return String(step);
      }).join("\n");
    }
    if (plan && typeof plan === "object") {
      if (Array.isArray(plan.steps)) return formatPlan(plan.steps);
      if (typeof plan.title === "string") return plan.title;
    }
    return "";
  }

  function textFor(activity) {
    if (isAssistant(activity)) return activity.text || "";
    if (isReasoning(activity)) return activity.reasoning || "";
    const kind = String(activity.kind);
    if (kind === "user.message") return activity.payload?.text || "";
    if (kind.startsWith("tool.")) {
      if (typeof activity.payload?.summary === "string" && activity.payload.summary.length > 0) return activity.payload.summary;
      if (typeof activity.payload?.text === "string" && activity.payload.text.length > 0) return activity.payload.text;
      return isLive(activity) ? "Running…" : activity.state === "failed" ? "Tool failed." : "Tool finished.";
    }
    if (kind.startsWith("command.") || kind.startsWith("test.")) {
      const text = activity.text || activity.payload?.text || activity.payload?.message || "";
      if (text.length > 0) return text;
      if (isLive(activity)) return kind.startsWith("test.") ? "Running tests…" : "Running…";
      if (activity.payload?.code !== undefined || activity.payload?.ok !== undefined) {
        return `Exit ${activity.payload?.code ?? (activity.payload?.ok ? 0 : "unknown")}${activity.payload?.ok === false ? " (failed)" : ""}`;
      }
      return kind.startsWith("test.") ? "Tests finished." : "Command finished.";
    }
    if (kind === "file.changed") return activity.payload?.path || activity.payload?.message || "";
    if (kind === "notice") {
      if (activity.payload?.type === "compaction") {
        const pruned = activity.payload?.pruned;
        return `Compacted ${pruned ?? "older"} tool result${pruned === 1 ? "" : "s"} to stay within the model budget.`;
      }
      return activity.payload?.message || "";
    }
    if (kind === "error") return activity.payload?.message || "Error";
    if (kind === "plan.updated") {
      return formatPlan(activity.payload?.plan ?? activity.payload?.steps ?? activity.payload?.message) || "Plan updated";
    }
    if (kind === "diff.updated") return activity.payload?.summary || activity.payload?.path || "Diff updated";
    if (kind === "approval.requested") {
      return activity.payload?.message || "This action needs approval. Runtime approval is not available in this interface.";
    }
    if (kind === "approval.resolved") return activity.payload?.message || activity.payload?.resolution || "Approval resolved.";
    return activity.text || activity.payload?.message || "";
  }

  function detailValue(activity) {
    if (activity.payload?.raw !== undefined) return activity.payload.raw;
    if (Array.isArray(activity.payload?.patches) && activity.payload.patches.length > 0) return activity.payload.patches;
    if (activity.payload?.arguments !== undefined && activity.payload.arguments !== "") return activity.payload.arguments;
    return null;
  }

  function stringifyDetail(value) {
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function makeAction(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "exec-action";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  async function copyText(button, text) {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = original; }, 1200);
    } catch {
      button.textContent = "Blocked";
      window.setTimeout(() => { button.textContent = original; }, 1400);
    }
  }

  async function openDiff(path) {
    const pane = document.getElementById("preview-pane");
    if (pane && !pane.classList.contains("open")) {
      pane.classList.add("open");
      pane.setAttribute("aria-hidden", "false");
    }
    if (typeof window.setInspectorTab === "function") window.setInspectorTab("diffs");
    try {
      const response = await fetch(`/api/project/diff?path=${encodeURIComponent(path)}`);
      const body = await response.json();
      const pre = document.querySelector("#inspector-diffs .inspector-diff-detail");
      if (pre) pre.textContent = body.diff || body.staged || "(no textual diff)";
    } catch { /* best-effort */ }
  }

  function createActions(activity) {
    const actions = document.createElement("div");
    actions.className = "exec-actions";
    const refs = {};
    if (activity.kind === "user.message") {
      const currentText = () => executionStore.get(activity.id)?.payload?.text || "";
      const copy = makeAction("Copy", () => void copyText(copy, currentText()));
      const edit = makeAction("Edit", () => {
        if (typeof chatRunning !== "undefined" && chatRunning) return;
        if (typeof promptEl !== "undefined" && promptEl) {
          promptEl.value = currentText();
          promptEl.style.height = "auto";
          promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
          promptEl.focus();
          if (typeof saveDraft === "function") saveDraft();
        }
      });
      refs.edit = edit;
      actions.append(copy, edit);
    } else if (isAssistant(activity)) {
      const copy = makeAction("Copy", () => void copyText(copy, executionStore.get(activity.id)?.text || ""));
      const regenerate = makeAction("Regenerate", () => {
        if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
      });
      refs.regenerate = regenerate;
      actions.append(copy, regenerate);
    } else if (activity.kind === "error") {
      const retry = makeAction("Retry", () => {
        if (typeof window.regenerateLastResponse === "function") window.regenerateLastResponse();
      });
      refs.retry = retry;
      actions.append(retry);
    } else if (activity.kind === "file.changed" && typeof activity.payload?.path === "string" && activity.payload.path) {
      actions.appendChild(makeAction("Open diff", () => void openDiff(activity.payload.path)));
    } else if (activity.kind === "approval.requested") {
      const approve = makeAction("Approve", () => {});
      approve.disabled = true;
      approve.title = "Approval actions are not available in this runtime";
      const reject = makeAction("Reject", () => {});
      reject.disabled = true;
      reject.title = "Approval actions are not available in this runtime";
      actions.append(approve, reject);
    }
    return { actions, refs };
  }

  function createHead(activity, options = {}) {
    const head = document.createElement(options.summary ? "summary" : "div");
    head.className = "exec-head";

    const icon = document.createElement("span");
    icon.className = "exec-icon";
    icon.dataset.tone = toneFor(activity);

    const title = document.createElement("div");
    title.className = "exec-title";
    const label = document.createElement("span");
    label.className = "exec-label";
    const subtitle = document.createElement("span");
    subtitle.className = "exec-subtitle";
    title.append(label, subtitle);

    head.append(icon, title);
    if (options.summary) {
      const chevron = document.createElement("span");
      chevron.className = "exec-reasoning-chevron";
      chevron.innerHTML = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m6.2 4.5 3.6 3.5-3.6 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.appendChild(chevron);
    }
    const state = document.createElement("span");
    state.className = "exec-state";
    head.appendChild(state);

    return { head, icon, label, subtitle, state };
  }

  function ensureDetails(entry) {
    if (entry.detailsEl) return entry;
    const host = document.createElement("div");
    host.className = "exec-details-host";
    const details = document.createElement("details");
    details.className = "exec-details";
    const summary = document.createElement("summary");
    const pre = document.createElement("pre");
    pre.className = "exec-pre";
    details.append(summary, pre);
    host.appendChild(details);
    entry.card.insertBefore(host, entry.afterBody ?? null);
    entry.detailsHost = host;
    entry.detailsEl = details;
    entry.detailsSummary = summary;
    entry.detailsPre = pre;
    return entry;
  }

  function buildCard(activity) {
    const card = document.createElement("article");
    card.className = "exec-card exec-card--new";
    card.dataset.activityId = activity.id;
    card.dataset.kind = activity.kind;
    card.dataset.state = activity.state || "";
    card.addEventListener("animationend", () => card.classList.remove("exec-card--new"), { once: true });

    const entry = { card, kind: activity.kind, isReasoning: isReasoning(activity) };
    if (entry.isReasoning) card.classList.add("exec-card--reasoning");

    if (entry.isReasoning) {
      const details = document.createElement("details");
      details.className = "exec-reasoning";
      const head = createHead(activity, { summary: true });
      const body = document.createElement("div");
      body.className = "exec-body";
      details.append(head.head, body);
      card.appendChild(details);
      Object.assign(entry, head, { details, body, afterBody: null });
      return entry;
    }

    const head = createHead(activity);
    const body = document.createElement("div");
    body.className = "exec-body";
    const actions = createActions(activity);
    card.append(head.head, body, actions.actions);
    Object.assign(entry, head, {
      body,
      actions: actions.actions,
      actionRefs: actions.refs,
      afterBody: actions.actions,
    });
    return entry;
  }

  function renderDetails(activity, entry) {
    const value = detailValue(activity);
    if (value === null) {
      if (entry.detailsHost) entry.detailsHost.hidden = true;
      return;
    }
    ensureDetails(entry);
    entry.detailsHost.hidden = false;
    const raw = stringifyDetail(value);
    if (entry.detailsPre.textContent !== raw) entry.detailsPre.textContent = raw;
    const summary = activity.payload?.untrusted ? "Details (untrusted raw)" : "Details";
    if (entry.detailsSummary.textContent !== summary) entry.detailsSummary.textContent = summary;
  }

  function renderThinking(body) {
    body.classList.remove("rich");
    body.textContent = "";
    const wrap = document.createElement("span");
    wrap.className = "exec-thinking";
    wrap.setAttribute("aria-label", "Thinking");
    const label = document.createElement("span");
    label.textContent = "Thinking";
    wrap.appendChild(label);
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = "exec-thinking-dot";
      wrap.appendChild(dot);
    }
    body.appendChild(wrap);
  }

  function renderBody(activity, entry) {
    const body = entry.body;
    if (isAssistant(activity)) {
      const text = activity.text || "";
      if (text.trim().length > 0) {
        body.hidden = false;
        body.classList.add("rich");
        if (typeof renderRichText === "function") renderRichText(body, text);
        else body.textContent = text;
      } else if (isLive(activity)) {
        body.hidden = false;
        renderThinking(body);
      } else {
        body.hidden = false;
        body.classList.remove("rich");
        body.textContent = "(empty response)";
      }
      return;
    }

    let text = textFor(activity);
    if (isReasoning(activity) && text.trim().length === 0) {
      text = isLive(activity) ? "Thinking…" : "No reasoning was recorded.";
    }
    if (body.textContent !== text) body.textContent = text;
    body.hidden = text.length === 0;
    if (!body.hidden) body.classList.remove("rich");
  }

  function renderActions(activity, entry, isLastAssistant) {
    if (!entry.actionRefs) {
      if (entry.actions) entry.actions.hidden = true;
      return;
    }
    const running = typeof chatRunning !== "undefined" && chatRunning;
    if (entry.actionRefs.edit) entry.actionRefs.edit.disabled = running;
    if (entry.actionRefs.regenerate) {
      entry.actionRefs.regenerate.hidden = !isLastAssistant;
      entry.actionRefs.regenerate.disabled = running;
    }
    if (entry.actionRefs.retry) entry.actionRefs.retry.disabled = running;
    if (entry.actions) entry.actions.hidden = false;
  }

  function updateCard(activity, entry, isLastAssistant) {
    const card = entry.card;
    card.dataset.kind = activity.kind;
    card.dataset.state = activity.state || "";

    const markup = iconFor(activity);
    if (entry.iconMarkup !== markup) {
      entry.icon.innerHTML = markup;
      entry.iconMarkup = markup;
    }
    const tone = toneFor(activity);
    if (entry.icon.dataset.tone !== tone) entry.icon.dataset.tone = tone;

    const label = titleFor(activity);
    if (entry.label.textContent !== label) entry.label.textContent = label;

    const subtitle = subtitleFor(activity);
    if (entry.subtitle.textContent !== subtitle) entry.subtitle.textContent = subtitle;
    entry.subtitle.hidden = subtitle.length === 0 || entry.isReasoning;

    const state = stateLabel(activity);
    if (entry.state.textContent !== state) entry.state.textContent = state;
    entry.state.dataset.state = activity.state || "";
    entry.state.hidden = state.length === 0;

    renderBody(activity, entry);
    if (!entry.isReasoning) {
      renderDetails(activity, entry);
      renderActions(activity, entry, isLastAssistant);
    }
  }

  function nearBottom(el, threshold = 96) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  function renderHead() {
    const head = document.getElementById("execution-timeline-head");
    const statusEl = document.getElementById("execution-timeline-status");
    const welcomeVisible = document.getElementById("welcome")?.hidden === false;
    const activities = executionStore.list();
    if (activities.length === 0) {
      if (head) head.hidden = true;
      return;
    }
    if (head) head.hidden = welcomeVisible;
    if (statusEl) {
      const running = (typeof chatRunning !== "undefined" && chatRunning)
        || activities.some((activity) => isLive(activity));
      statusEl.textContent = running ? "Running" : "Idle";
      statusEl.dataset.tone = running ? "live" : "ok";
    }
  }

  function render() {
    if (!enabled) {
      root.hidden = true;
      const head = document.getElementById("execution-timeline-head");
      if (head) head.hidden = true;
      return;
    }
    const all = executionStore.list();
    const activities = all.filter((activity) => !HIDDEN_PREFIXES.some((prefix) => String(activity.kind).startsWith(prefix)));
    const welcomeVisible = document.getElementById("welcome")?.hidden === false;
    renderHead();

    if (activities.length === 0) {
      cards.clear();
      root.replaceChildren();
      root.hidden = welcomeVisible;
      if (!welcomeVisible) {
        const empty = document.createElement("div");
        empty.className = "exec-empty";
        empty.textContent = "Execution activity will appear here.";
        root.appendChild(empty);
      }
      if (typeof updateJumpLatest === "function") updateJumpLatest();
      return;
    }

    const shouldStick = nearBottom(root);
    root.hidden = false;

    let lastAssistantId = null;
    for (let i = activities.length - 1; i >= 0; i -= 1) {
      if (isAssistant(activities[i])) { lastAssistantId = activities[i].id; break; }
    }

    const visible = activities.slice(-120);
    const desired = new Set();
    let next = root.firstElementChild;
    for (const activity of visible) {
      let entry = cards.get(activity.id);
      if (entry === undefined) {
        entry = buildCard(activity);
        cards.set(activity.id, entry);
      }
      updateCard(activity, entry, activity.id === lastAssistantId);
      desired.add(activity.id);
      const node = entry.card;
      if (node !== next) root.insertBefore(node, next);
      next = node.nextElementSibling;
    }
    while (next) {
      const after = next.nextElementSibling;
      next.remove();
      next = after;
    }
    for (const id of [...cards.keys()]) {
      if (!desired.has(id)) cards.delete(id);
    }

    if (shouldStick) root.scrollTop = root.scrollHeight;
    if (typeof updateJumpLatest === "function") updateJumpLatest();
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      try {
        render();
      } catch (err) {
        console.error("[execution-timeline] render failed", err);
      }
    });
  }

  window.refreshExecutionTimeline = scheduleRender;
  executionStore.subscribe(scheduleRender);
  render();
})();
