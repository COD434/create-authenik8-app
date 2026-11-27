// Normalized execution activity store (StudioEvent v1 consumer).
// This is the migration bridge toward a Codex-style execution timeline.
// It stores activities by stable activityId and applies idempotent updates.

const executionStore = (() => {
  const activities = new Map();
  const order = [];
  let listeners = [];

  const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

  function notify() {
    for (const fn of listeners) {
      try { fn(); } catch { /* listener failures must not break the stream */ }
    }
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function durationBetween(startTs, endTs) {
    const start = Date.parse(startTs);
    const end = Date.parse(endTs);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return end - start;
  }

  function markTerminal(activity, ts) {
    if (activity.endedTs !== null) return;
    activity.endedTs = ts ?? activity.ts ?? isoNow();
    const duration = durationBetween(activity.startedTs, activity.endedTs);
    if (duration !== null) activity.durationMs = duration;
  }

  function ensureActivity(event) {
    const id = event.activityId;
    if (typeof id !== "string" || id.length === 0) return null;
    let activity = activities.get(id);
    if (activity === undefined) {
      activity = {
        id,
        kind: event.kind,
        source: event.source,
        sessionId: event.sessionId,
        turnId: event.turnId,
        state: event.state ?? "running",
        ts: event.ts,
        startedTs: typeof event.ts === "string" ? event.ts : null,
        endedTs: null,
        durationMs: null,
        seq: event.seq,
        payload: { ...(event.payload ?? {}) },
        text: "",
        reasoning: "",
      };
      activities.set(id, activity);
      order.push(id);
    }
    return activity;
  }

  function appendText(activity, key, value) {
    if (typeof value !== "string" || value.length === 0) return;
    activity[key] += value;
  }

  function applyOne(event) {
    if (!event || event.v !== 1 || typeof event.kind !== "string") return false;
    const activity = ensureActivity(event);
    if (activity === null) return false;

    activity.seq = typeof event.seq === "number" ? event.seq : activity.seq;
    if (typeof event.ts === "string") {
      activity.ts = event.ts;
      if (activity.startedTs === null) activity.startedTs = event.ts;
    }
    activity.source = typeof event.source === "string" ? event.source : activity.source;
    activity.kind = typeof event.kind === "string" ? event.kind : activity.kind;
    if (typeof event.state === "string") {
      const incoming = event.state;
      const currentTerminal = TERMINAL_STATES.has(activity.state);
      const incomingTerminal = TERMINAL_STATES.has(incoming);
      // Late output/started events must not downgrade a settled activity.
      if (!(currentTerminal && !incomingTerminal)) {
        activity.state = incoming;
      }
    }
    if (event.payload && typeof event.payload === "object") {
      activity.payload = { ...activity.payload, ...event.payload };
    }

    switch (event.kind) {
      case "assistant.message.delta":
        appendText(activity, "text", event.payload?.text);
        break;
      case "assistant.message.completed":
        if (activity.text.length === 0) appendText(activity, "text", event.payload?.text);
        break;
      case "reasoning.delta":
        appendText(activity, "reasoning", event.payload?.text);
        break;
      case "reasoning.completed":
        if (activity.reasoning.length === 0) appendText(activity, "reasoning", event.payload?.text);
        break;
      case "command.output":
      case "test.output":
      case "tool.output":
        appendText(activity, "text", event.payload?.text ?? event.payload?.output);
        break;
      default:
        break;
    }

    if (TERMINAL_STATES.has(activity.state)) markTerminal(activity, event.ts);
    else {
      // A resumed/streaming activity is live again; a stale end time would
      // freeze its duration at the first terminal event.
      activity.endedTs = null;
      activity.durationMs = null;
    }
    return true;
  }

  function applyEvent(event) {
    if (applyOne(event)) notify();
  }

  function applyEvents(events) {
    if (!Array.isArray(events)) return;
    let changed = false;
    for (const event of events) changed = applyOne(event) || changed;
    if (changed) notify();
  }

  function reset() {
    const changed = activities.size > 0;
    activities.clear();
    order.length = 0;
    if (changed) notify();
  }

  function list() {
    return order.map((id) => activities.get(id)).filter(Boolean);
  }

  function get(id) {
    return activities.get(id) ?? null;
  }

  /**
   * Regeneration replaces the answer to the last user message. Legacy chat
   * removes the trailing DOM rows; the timeline mirrors that by dropping every
   * activity after the most recent user message, keeping the prompt itself.
   */
  function truncateAfterLastUser() {
    let lastUser = -1;
    for (let i = order.length - 1; i >= 0; i -= 1) {
      if (activities.get(order[i])?.kind === "user.message") {
        lastUser = i;
        break;
      }
    }
    if (lastUser === -1) return false;
    const removed = order.splice(lastUser + 1);
    for (const id of removed) activities.delete(id);
    if (removed.length > 0) notify();
    return removed.length > 0;
  }

  /**
   * Stop/error recovery: anything still live belongs to the interrupted turn.
   * Settling it prevents a cancelled tool or answer from looking active
   * forever, and gives the UI a frozen duration for reasoning blocks.
   */
  function settleRunning(state = "cancelled") {
    const nextState = TERMINAL_STATES.has(state) ? state : "cancelled";
    const now = isoNow();
    let changed = false;
    for (const activity of activities.values()) {
      if (TERMINAL_STATES.has(activity.state)) continue;
      activity.state = nextState;
      markTerminal(activity, now);
      changed = true;
    }
    if (changed) notify();
    return changed;
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }

  return { applyEvent, applyEvents, reset, list, get, subscribe, truncateAfterLastUser, settleRunning };
})();
