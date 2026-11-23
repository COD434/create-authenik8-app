import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The stylesheet is load-bearing for behavior: a misplaced rule once kept
// every "closed" modal on screen and made the whole app unclickable. These
// are structural regression tests for exactly that failure class.
const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "style.css");
const css = readFileSync(cssPath, "utf8");

/** Comments can contain braces; strip them before any structural scan. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function braceDepthAt(source: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
  }
  return depth;
}

describe("style.css structure", () => {
  it("stays balanced: braces open and close evenly, never negative", () => {
    const source = withoutComments(css);
    let depth = 0;
    for (const char of source) {
      if (char === "{") depth++;
      if (char === "}") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("applies the [hidden] visibility guard at the top level, outside every @media block", () => {
    const source = withoutComments(css);
    const guard = source.indexOf("[hidden]");
    expect(guard).toBeGreaterThan(-1);
    // Inside a media query the guard would stop applying on wide screens,
    // and author `display: grid/flex` on overlays resurrects "closed" modals
    // over the entire app. The guard must sit at brace depth 0.
    expect(braceDepthAt(source, guard)).toBe(0);
  });

  it("skins every runtime surface the client can show", () => {
    // The template wizard reuses the modal chrome: its output, status line,
    // and buttons must share the terminal/pill styling, not fall out raw.
    expect(/#agent-output, #run-output, #template-output \{/.test(css)).toBe(true);
    expect(/#run-state::before, #template-state::before \{/.test(css)).toBe(true);
    expect(/#agent-run, #agent-dismiss, #template-run, #template-dismiss \{/.test(css)).toBe(true);
    expect(css).toContain(".plan-panel");
    expect(css).toContain(".plan-step.completed .plan-mark");
    // The transcript viewer must keep its own bounded scroll surface; a
    // long child run must not push the close control off screen.
    expect(css).toContain(".subagents-modal");
    expect(/#subagents-list-view, #subagents-transcript-view \{/.test(css)).toBe(true);
    expect(css).toContain(".subagent-badge.build");
  });

  it("keeps a stacked small-screen layout", () => {
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain("100dvh");
  });
});
