// Normalized execution activity store (StudioEvent v1 consumer).
// This is the migration bridge toward a Codex-style execution timeline.
// It stores activities by stable activityId and applies idempotent updates.

const executionStore = (() => {
  const activities = new Map();
  const order = [];
  let listeners = [];

  function notify() {
    for (const fn of listeners) {
      try { fn(); } catch { /* listener failures must not break the stream */ }
    }
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

  function applyEvent(event) {
    if (!event || event.v !== 1 || typeof event.kind !== "string") return;
    const activity = ensureActivity(event);
    if (activity === null) return;

    activity.seq = typeof event.seq === "number" ? event.seq : activity.seq;
    activity.ts = typeof event.ts === "string" ? event.ts : activity.ts;
    activity.source = typeof event.source === "string" ? event.source : activity.source;
    activity.kind = typeof event.kind === "string" ? event.kind : activity.kind;
    if (typeof event.state === "string") activity.state = event.state;
    if (event.payload && typeof event.payload === "object") {
      activity.payload = { ...activity.payload, ...event.payload };
    }

    switch (event.kind) {
      case "assistant.message.delta":
        appendText(activity, "text", event.payload?.text);
        break;
      case "reasoning.delta":
        appendText(activity, "reasoning", event.payload?.text);
        break;
      case "command.output":
      case "test.output":
      case "tool.output":
        appendText(activity, "text", event.payload?.text ?? event.payload?.output);
        break;
      default:
        break;
    }

    notify();
  }

  function applyEvents(events) {
    if (!Array.isArray(events)) return;
    for (const event of events) applyEvent(event);
  }

  function reset() {
    activities.clear();
    order.length = 0;
    notify();
  }

  function list() {
    return order.map((id) => activities.get(id)).filter(Boolean);
  }

  function get(id) {
    return activities.get(id) ?? null;
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }

  return { applyEvent, applyEvents, reset, list, get, subscribe };
})();
