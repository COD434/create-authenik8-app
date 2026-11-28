// Normalized execution activity store (StudioEvent v1 consumer).
// This is the migration bridge toward a Codex-style execution timeline.
// It stores activities by stable activityId and applies idempotent updates.

const EXECUTION_TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
function executionIsoNow() { return new Date().toISOString(); }
function executionDurationBetween(startTs, endTs) {
  const start = Date.parse(startTs); const end = Date.parse(endTs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}
function markExecutionTerminal(activity, ts) {
  if (activity.endedTs !== null) return;
  activity.endedTs = ts ?? activity.ts ?? executionIsoNow();
  const duration = executionDurationBetween(activity.startedTs, activity.endedTs);
  if (duration !== null) activity.durationMs = duration;
}
function appendExecutionText(activity, key, value) { if (typeof value === "string" && value.length > 0) activity[key] += value; }
function applyExecutionText(activity, event) {
  switch (event.kind) {
    case "assistant.message.delta": appendExecutionText(activity, "text", event.payload?.text); break;
    case "assistant.message.completed": if (activity.text.length === 0) appendExecutionText(activity, "text", event.payload?.text); break;
    case "reasoning.delta": appendExecutionText(activity, "reasoning", event.payload?.text); break;
    case "reasoning.completed": if (activity.reasoning.length === 0) appendExecutionText(activity, "reasoning", event.payload?.text); break;
    case "command.output": case "test.output": case "tool.output": appendExecutionText(activity, "text", event.payload?.text ?? event.payload?.output); break;
    default: break;
  }
}

const executionStore = (() => {
  const activities = new Map();
  const order = [];
  let listeners = [];
  function notify() { for (const fn of listeners) { try { fn(); } catch (error) { void error; } } }
  function ensureActivity(event) {
    const id = event.activityId;
    if (typeof id !== "string" || id.length === 0) return null;
    let activity = activities.get(id);
    if (activity !== undefined) return activity;
    activity = { id, kind: event.kind, source: event.source, sessionId: event.sessionId, turnId: event.turnId, state: event.state ?? "running", ts: event.ts, startedTs: typeof event.ts === "string" ? event.ts : null, endedTs: null, durationMs: null, seq: event.seq, payload: { ...(event.payload ?? {}) }, text: "", reasoning: "" };
    activities.set(id, activity); order.push(id); return activity;
  }
  function applyOne(event) {
    if (!event || event.v !== 1 || typeof event.kind !== "string") return false;
    const activity = ensureActivity(event);
    if (activity === null) return false;
    activity.seq = typeof event.seq === "number" ? event.seq : activity.seq;
    if (typeof event.ts === "string") { activity.ts = event.ts; if (activity.startedTs === null) activity.startedTs = event.ts; }
    activity.source = typeof event.source === "string" ? event.source : activity.source;
    activity.kind = typeof event.kind === "string" ? event.kind : activity.kind;
    if (typeof event.state === "string") {
      const incoming = event.state;
      if (!(EXECUTION_TERMINAL_STATES.has(activity.state) && !EXECUTION_TERMINAL_STATES.has(incoming))) activity.state = incoming;
    }
    if (event.payload && typeof event.payload === "object") activity.payload = { ...activity.payload, ...event.payload };
    applyExecutionText(activity, event);
    if (EXECUTION_TERMINAL_STATES.has(activity.state)) markExecutionTerminal(activity, event.ts);
    else { activity.endedTs = null; activity.durationMs = null; }
    return true;
  }
  function applyEvent(event) { if (applyOne(event)) notify(); }
  function applyEvents(events) { if (!Array.isArray(events)) return; let changed = false; for (const event of events) changed = applyOne(event) || changed; if (changed) notify(); }
  function reset() { const changed = activities.size > 0; activities.clear(); order.length = 0; if (changed) notify(); }
  function list() { return order.map((id) => activities.get(id)).filter(Boolean); }
  function get(id) { return activities.get(id) ?? null; }
  function truncateAfterLastUser() {
    let lastUser = -1;
    for (let i = order.length - 1; i >= 0; i -= 1) { if (activities.get(order[i])?.kind === "user.message") { lastUser = i; break; } }
    if (lastUser === -1) return false;
    const removed = order.splice(lastUser + 1); for (const id of removed) activities.delete(id); if (removed.length > 0) notify(); return removed.length > 0;
  }
  function settleRunning(state = "cancelled") {
    const nextState = EXECUTION_TERMINAL_STATES.has(state) ? state : "cancelled"; const now = executionIsoNow(); let changed = false;
    for (const activity of activities.values()) { if (EXECUTION_TERMINAL_STATES.has(activity.state)) continue; activity.state = nextState; markExecutionTerminal(activity, now); changed = true; }
    if (changed) notify(); return changed;
  }
  function subscribe(fn) { if (typeof fn !== "function") return () => {}; listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; }
  return { applyEvent, applyEvents, reset, list, get, subscribe, truncateAfterLastUser, settleRunning };
})();
