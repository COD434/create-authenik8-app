// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../studio-src/App.js";
import type { StudioSnapshot } from "../../src/commands/studio/types.js";

const snapshot: StudioSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T10:00:00.000Z",
  project: {
    name: "browser-contract",
    rootDir: "/tmp/browser-contract",
    preset: "auth-oauth",
    packageManager: "npm",
    runtime: "node",
    database: "postgresql",
    versions: {
      generator: "2.4.4",
      engine: "2.0.6",
    },
  },
  scan: {
    mode: "offline",
    boundary: "Offline Doctor snapshot. No .env secrets or live services were read.",
    summary: {
      passed: 12,
      warnings: 0,
      failed: 0,
      skipped: 2,
    },
  },
  posture: {
    status: "clear",
    label: "No issues detected",
    detail: "The scoped offline checks passed. This is not a certification.",
  },
  capabilities: [
    {
      id: "preset",
      label: "auth-oauth",
      detail: "Generated application preset",
    },
    {
      id: "sessions",
      label: "Stateful sessions",
      detail: "JWT access tokens with refresh rotation",
    },
    {
      id: "prisma",
      label: "Prisma",
      detail: "PostgreSQL identity persistence",
    },
    {
      id: "oauth-github",
      label: "GitHub OAuth",
      detail: "Generated OAuth provider boundary",
    },
  ],
  drift: {
    status: "clear",
    label: "Contract aligned",
    detail: "Generated structure and declarations agree.",
    checks: [],
  },
  productionReadiness: {
    status: "not-assessed",
    label: "Not assessed",
    detail: "Production readiness requires an explicit scan.",
    command: "npx create-authenik8-app@latest doctor --production",
  },
  upgrade: {
    status: "current",
    generator: { current: "2.4.4", target: "2.4.4" },
    engine: { current: "2.0.6", target: "2.0.6" },
    actions: [],
  },
  nextAction: {
    label: "Assess production readiness",
    detail: "Run the explicit production scan before deployment.",
    command: "npx create-authenik8-app@latest doctor --production",
  },
  findings: [],
};

let root: Root | undefined;

async function renderStudio(payload: unknown): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
  );
  const target = document.createElement("div");
  document.body.append(target);
  root = createRoot(target);
  await act(async () => {
    root!.render(
      createElement(
        Theme,
        { theme: neutralTheme, mode: "dark" },
        createElement(App),
      ),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Studio browser contract", () => {
  it("renders an actionable, accessible snapshot without automatic axe violations", async () => {
    await renderStudio(snapshot);

    expect(document.querySelector("h1")?.textContent).toBe("browser-contract");
    expect(document.querySelectorAll(".metric-link")).toHaveLength(4);
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>(".metric-link")].map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual(["#doctor", "#doctor", "#upgrades", "#boundary"]);
    expect(document.body.textContent).toContain(
      "Point-in-time · restart Studio to refresh",
    );

    const results = await axe.run(document.body, {
      rules: {
        // jsdom has no layout engine, so axe cannot calculate contrast here.
        "color-contrast": { enabled: false },
      },
    });
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.flatMap((node) => node.target),
      })),
    ).toEqual([]);
  });

  it("rejects an incompatible snapshot instead of rendering misleading status", async () => {
    await renderStudio({ schemaVersion: 2, project: { name: "unsafe" } });

    expect(document.querySelector("[role='alert']")?.textContent).toContain(
      "Studio received an incompatible snapshot.",
    );
    expect(document.body.textContent).not.toContain("No issues detected");
  });
});
