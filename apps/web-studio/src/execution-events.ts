/**
 * Provider-independent execution event protocol for Authenik8 Studio.
 *
 * Adapters translate provider/runtime-specific events into these normalized
 * events. The frontend consumes only this format, so chat, agent, and runner
 * execution can share one timeline renderer.
 *
 * Compatibility: existing SSE payloads remain supported during migration;
 * adapters can convert legacy payloads into StudioEvents.
 */

export const STUDIO_EVENT_VERSION = 1 as const;

export type StudioEventVersion = typeof STUDIO_EVENT_VERSION;

export type StudioEventSource = "chat" | "agent" | "runner" | "system";

export type StudioEventKind =
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "turn.cancelled"
  | "user.message"
  | "assistant.message.started"
  | "assistant.message.delta"
  | "assistant.message.completed"
  | "reasoning.started"
  | "reasoning.delta"
  | "reasoning.completed"
  | "plan.updated"
  | "tool.started"
  | "tool.output"
  | "tool.completed"
  | "tool.failed"
  | "command.started"
  | "command.output"
  | "command.completed"
  | "file.changed"
  | "diff.updated"
  | "approval.requested"
  | "approval.resolved"
  | "test.started"
  | "test.output"
  | "test.completed"
  | "error"
  | "notice";

export type StudioEventState =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type StudioEvent = {
  v: StudioEventVersion;
  id: string;
  sessionId: string;
  turnId: string;
  seq: number;
  ts: string;
  source: StudioEventSource;
  kind: StudioEventKind;
  activityId: string;
  parentActivityId?: string;
  state?: StudioEventState;
  payload: Record<string, unknown>;
};

export type StudioEventInput = Omit<StudioEvent, "v" | "id" | "seq" | "ts"> & {
  v?: StudioEventVersion;
  id?: string;
  seq?: number;
  ts?: string;
};

export type StudioEventStream = {
  nextSeq: () => number;
  emit: (input: StudioEventInput) => StudioEvent;
};

export function createStudioEventId(now = Date.now(), random = Math.random()): string {
  return `se_${now.toString(36)}_${random.toString(36).slice(2, 10)}`;
}

export function createStudioEventStream(options?: {
  startSeq?: number;
  now?: () => string;
  id?: () => string;
}): StudioEventStream {
  let seq = Math.max(0, Math.trunc(options?.startSeq ?? 0));
  const now = options?.now ?? (() => new Date().toISOString());
  const id = options?.id ?? (() => createStudioEventId());
  return {
    nextSeq: () => ++seq,
    emit: (input) => ({
      v: STUDIO_EVENT_VERSION,
      id: input.id ?? id(),
      seq: input.seq ?? ++seq,
      ts: input.ts ?? now(),
      sessionId: input.sessionId,
      turnId: input.turnId,
      source: input.source,
      kind: input.kind,
      activityId: input.activityId,
      ...(input.parentActivityId !== undefined ? { parentActivityId: input.parentActivityId } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      payload: input.payload,
    }),
  };
}

export function isStudioEvent(value: unknown): value is StudioEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.v === STUDIO_EVENT_VERSION
    && typeof v.id === "string"
    && typeof v.sessionId === "string"
    && typeof v.turnId === "string"
    && typeof v.seq === "number"
    && typeof v.ts === "string"
    && typeof v.source === "string"
    && typeof v.kind === "string"
    && typeof v.activityId === "string"
    && typeof v.payload === "object"
    && v.payload !== null
    && !Array.isArray(v.payload);
}

type LegacyChatTool = {
  id?: unknown;
  name?: unknown;
  phase?: unknown;
  ok?: unknown;
  summary?: unknown;
  childId?: unknown;
  arguments?: unknown;
  patches?: unknown;
};

export type LegacyChatSseEvent = Record<string, unknown>;

export type LegacyChatAdapterState = {
  sessionId: string;
  turnId: string;
  messageActivityId: string;
  reasoningActivityId: string | null;
  round: number;
  toolArgsById: Map<string, string>;
};

export function createLegacyChatAdapterState(sessionId: string, turnId: string): LegacyChatAdapterState {
  return {
    sessionId,
    turnId,
    messageActivityId: `${turnId}:assistant`,
    reasoningActivityId: null,
    round: 0,
    toolArgsById: new Map(),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * Convert a legacy chat SSE payload to zero or more normalized StudioEvents.
 * This is a compatibility bridge; new code should emit StudioEvents directly.
 */
export function fromLegacyChatSseEvent(
  event: LegacyChatSseEvent,
  state: LegacyChatAdapterState,
  stream: StudioEventStream,
): StudioEvent[] {
  const out: StudioEvent[] = [];
  const round = asNumber(event.round);
  if (round !== undefined) {
    state.round = round;
    state.messageActivityId = `${state.turnId}:assistant:${round}`;
    state.reasoningActivityId = null;
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "assistant.message.started",
      activityId: state.messageActivityId,
      state: "running",
      payload: { round, mode: asString(event.mode) },
    }));
  }

  if (typeof event.reasoning === "string" && event.reasoning.length > 0) {
    if (state.reasoningActivityId === null) {
      state.reasoningActivityId = `${state.turnId}:reasoning:${state.round || 1}`;
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "chat",
        kind: "reasoning.started",
        activityId: state.reasoningActivityId,
        state: "running",
        payload: { round: state.round || 1 },
      }));
    }
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "reasoning.delta",
      activityId: state.reasoningActivityId,
      state: "running",
      payload: { text: event.reasoning },
    }));
  }

  if (typeof event.delta === "string") {
    if (state.reasoningActivityId !== null) {
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "chat",
        kind: "reasoning.completed",
        activityId: state.reasoningActivityId,
        state: "completed",
        payload: {},
      }));
      state.reasoningActivityId = null;
    }
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "assistant.message.delta",
      activityId: state.messageActivityId,
      state: "running",
      payload: { text: event.delta },
    }));
  }

  const tool = asRecord(event.tool) as LegacyChatTool | undefined;
  if (tool !== undefined) {
    const id = asString(tool.id) ?? `${state.turnId}:tool:unknown`;
    const name = asString(tool.name) ?? "tool";
    const phase = asString(tool.phase);
    if (phase === "start") {
      if (typeof tool.arguments === "string") state.toolArgsById.set(id, tool.arguments);
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "chat",
        kind: "tool.started",
        activityId: id,
        state: "running",
        payload: {
          name,
          ...(typeof tool.arguments === "string" ? { arguments: tool.arguments } : {}),
        },
      }));
    } else if (phase === "done") {
      const ok = tool.ok === true;
      const args = state.toolArgsById.get(id);
      if (args !== undefined) state.toolArgsById.delete(id);
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "chat",
        kind: ok ? "tool.completed" : "tool.failed",
        activityId: id,
        state: ok ? "completed" : "failed",
        payload: {
          name,
          ...(typeof tool.summary === "string" ? { summary: tool.summary } : {}),
          ...(typeof tool.childId === "string" ? { childId: tool.childId } : {}),
          ...(Array.isArray(tool.patches) ? { patches: tool.patches } : {}),
          ok,
        },
      }));
      if (ok && name === "write_file") {
        let path = "";
        if (typeof args === "string") {
          try { const parsed = JSON.parse(args) as { path?: unknown }; if (typeof parsed.path === "string") path = parsed.path; } catch { /* ignore */ }
        }
        out.push(stream.emit({
          sessionId: state.sessionId,
          turnId: state.turnId,
          source: "chat",
          kind: "file.changed",
          activityId: `${state.turnId}:file:${path || id}`,
          state: "completed",
          payload: { path, toolId: id },
        }));
      }
    }
  }

  if (event.plan !== undefined) {
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "plan.updated",
      activityId: `${state.turnId}:plan`,
      state: "completed",
      payload: { plan: event.plan },
    }));
  }

  if (event.compaction !== undefined) {
    const compaction = asRecord(event.compaction);
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "system",
      kind: "notice",
      activityId: `${state.turnId}:compaction:${stream.nextSeq()}`,
      state: "completed",
      payload: { type: "compaction", ...(compaction ?? { value: event.compaction }) },
    }));
  }

  if (typeof event.note === "string") {
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "system",
      kind: "notice",
      activityId: `${state.turnId}:note:${stream.nextSeq()}`,
      state: "completed",
      payload: { type: "note", message: event.note },
    }));
  }

  if (typeof event.error === "string") {
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "error",
      activityId: `${state.turnId}:error`,
      state: "failed",
      payload: { message: event.error },
    }));
  }

  if (event.done === true) {
    if (state.reasoningActivityId !== null) {
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "chat",
        kind: "reasoning.completed",
        activityId: state.reasoningActivityId,
        state: "completed",
        payload: {},
      }));
      state.reasoningActivityId = null;
    }
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "assistant.message.completed",
      activityId: state.messageActivityId,
      state: "completed",
      payload: {
        ...(asNumber(event.rounds) !== undefined ? { rounds: event.rounds } : {}),
      },
    }));
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "chat",
      kind: "turn.completed",
      activityId: state.turnId,
      state: "completed",
      payload: {
        ...(asNumber(event.rounds) !== undefined ? { rounds: event.rounds } : {}),
      },
    }));
  }

  return out;
}

export type LegacyAgentAdapterState = {
  sessionId: string;
  turnId: string;
};

export function createLegacyAgentAdapterState(sessionId: string, turnId: string): LegacyAgentAdapterState {
  return { sessionId, turnId };
}

function summarizeAgentEvent(event: Record<string, unknown>): { kind: StudioEventKind; state: StudioEventState; name: string; text: string } {
  const type = asString(event.type) ?? asString(event.kind) ?? "agent.event";
  const text = asString(event.message) ?? asString(event.text) ?? asString(event.output) ?? "";
  if (type.includes("command")) return { kind: "command.output", state: "running", name: type, text };
  if (type.includes("file") || type.includes("write") || type.includes("edit")) return { kind: "file.changed", state: "completed", name: type, text };
  if (type.includes("error")) return { kind: "error", state: "failed", name: type, text: text || type };
  return { kind: "notice", state: "running", name: type, text: text || type };
}

export function fromLegacyAgentSseEvent(
  event: LegacyChatSseEvent,
  state: LegacyAgentAdapterState,
  stream: StudioEventStream,
): StudioEvent[] {
  const out: StudioEvent[] = [];
  const agent = asRecord(event.agent);
  if (agent !== undefined) {
    const phase = asString(agent.phase);
    if (phase === "start") {
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "agent",
        kind: "turn.started",
        activityId: state.turnId,
        state: "running",
        payload: {},
      }));
    } else if (phase === "done") {
      const ok = agent.ok === true;
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "agent",
        kind: ok ? "turn.completed" : "turn.failed",
        activityId: state.turnId,
        state: ok ? "completed" : "failed",
        payload: { ...agent },
      }));
      if (!ok) {
        const message = asString(agent.errorMessage) ?? asString(agent.errorCode) ?? "Agent failed";
        out.push(stream.emit({
          sessionId: state.sessionId,
          turnId: state.turnId,
          source: "agent",
          kind: "error",
          activityId: `${state.turnId}:error`,
          state: "failed",
          payload: { message },
        }));
      }
    }
  }

  const agentEvent = asRecord(event.agentEvent);
  if (agentEvent !== undefined) {
    const summary = summarizeAgentEvent(agentEvent);
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "agent",
      kind: summary.kind,
      activityId: `${state.turnId}:agent:${stream.nextSeq()}`,
      state: summary.state,
      payload: {
        name: summary.name,
        ...(summary.text ? { text: summary.text } : {}),
        raw: agentEvent,
        untrusted: true,
      },
    }));
  }

  return out;
}

export type LegacyRunAdapterState = {
  sessionId: string;
  turnId: string;
  commandActivityId: string;
};

export function createLegacyRunAdapterState(sessionId: string, turnId: string): LegacyRunAdapterState {
  return { sessionId, turnId, commandActivityId: `${turnId}:command` };
}

export function fromLegacyRunSseEvent(
  event: LegacyChatSseEvent,
  state: LegacyRunAdapterState,
  stream: StudioEventStream,
): StudioEvent[] {
  const out: StudioEvent[] = [];
  const run = asRecord(event.run);
  if (run !== undefined) {
    const phase = asString(run.phase);
    if (phase === "starting" || phase === "running") {
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "runner",
        kind: "command.started",
        activityId: state.commandActivityId,
        state: "running",
        payload: { ...run },
      }));
    } else if (phase === "exited" || phase === "failed") {
      const ok = phase === "exited" && run.ok !== false;
      out.push(stream.emit({
        sessionId: state.sessionId,
        turnId: state.turnId,
        source: "runner",
        kind: "command.completed",
        activityId: state.commandActivityId,
        state: ok ? "completed" : "failed",
        payload: { ...run },
      }));
    }
  }
  if (typeof event.runOut === "string") {
    out.push(stream.emit({
      sessionId: state.sessionId,
      turnId: state.turnId,
      source: "runner",
      kind: "command.output",
      activityId: state.commandActivityId,
      state: "running",
      payload: { text: event.runOut },
    }));
  }
  return out;
}
