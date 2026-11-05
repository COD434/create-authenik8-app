import { describe, expect, it } from "vitest";

import { buildOpenCodeRunArgs, extractSessionId } from "../src/opencode.js";

describe("buildOpenCodeRunArgs", () => {
  it("builds the minimal argv with the prompt safely after --", () => {
    expect(buildOpenCodeRunArgs({ prompt: "do the thing" })).toEqual([
      "run",
      "--format",
      "json",
      "--",
      "do the thing",
    ]);
  });

  it("never parses flag-like prompt text as flags", () => {
    const args = buildOpenCodeRunArgs({ prompt: "--model evil --auto please" });
    expect(args[args.length - 1]).toBe("--model evil --auto please");
    expect(args[args.length - 2]).toBe("--");
    expect(args.filter((arg) => arg === "--model")).toHaveLength(0);
  });

  it("adds model, agent, session, and standalone only when requested", () => {
    const args = buildOpenCodeRunArgs(
      { prompt: "p", model: "provider/model#variant", agent: "build", sessionId: "ses_123" },
      { standalone: true },
    );
    expect(args).toEqual([
      "run",
      "--format",
      "json",
      "--standalone",
      "--model",
      "provider/model#variant",
      "--agent",
      "build",
      "--session",
      "ses_123",
      "--",
      "p",
    ]);
  });

  it("omits --auto unless autoApprove is explicitly true", () => {
    expect(buildOpenCodeRunArgs({ prompt: "p" }).includes("--auto")).toBe(false);
    expect(buildOpenCodeRunArgs({ prompt: "p", autoApprove: false }).includes("--auto")).toBe(false);
    expect(buildOpenCodeRunArgs({ prompt: "p", autoApprove: true }).includes("--auto")).toBe(true);
  });
});

describe("extractSessionId (tolerant, third-party output)", () => {
  it("reads top-level and nested session ids from JSON output", () => {
    expect(extractSessionId('{"sessionID":"ses_abc","parts":[]}')).toBe("ses_abc");
    expect(extractSessionId('{"session":{"id":"ses_nested"}}')).toBe("ses_nested");
  });

  it("returns null for empty, plain, or JSON without session data", () => {
    expect(extractSessionId("")).toBeNull();
    expect(extractSessionId("just text output")).toBeNull();
    expect(extractSessionId('{"parts":[]}')).toBeNull();
  });

  it("falls back to a tolerant pattern for unexpected shapes", () => {
    expect(extractSessionId('prefix "session_id":"ses_from_pattern" suffix')).toBe("ses_from_pattern");
  });
});
