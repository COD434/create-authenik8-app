// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

// Loads the real Studio page and the classic scripts exactly as the browser
// does, so renderRichText is exercised end to end: presentation engine first,
// Markdown fallback second. This is where the code-fence crash lived.

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const SCRIPTS = ["app-state.js", "app-presentation.js", "app-presentation-render.js", "app-ui.js", "app-markdown.js"];

let context: vm.Context;

function scriptFn(name: string): (...args: unknown[]) => unknown {
  const value = Reflect.get(context, name);
  if (typeof value !== "function") throw new Error(`scripts did not define ${name}`);
  return value as (...args: unknown[]) => unknown;
}

function newHost(): HTMLElement {
  return document.createElement("div");
}

beforeAll(async () => {
  const html = await readFile(path.join(publicDir, "index.html"), "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));
  // The real jsdom window carries localStorage; matchMedia is missing in
  // this jsdom setup, so stub it before loading scripts that read it at boot.
  const jsdomWindow = document.defaultView;
  if (jsdomWindow === null) throw new Error("jsdom window unavailable");
  if (typeof jsdomWindow.matchMedia !== "function") {
    Object.defineProperty(jsdomWindow, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() { return false; },
      }),
    });
  }
  if (typeof jsdomWindow.requestAnimationFrame !== "function") {
    Object.defineProperty(jsdomWindow, "requestAnimationFrame", {
      configurable: true,
      value: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    });
  }
  if (typeof jsdomWindow.cancelAnimationFrame !== "function") {
    Object.defineProperty(jsdomWindow, "cancelAnimationFrame", {
      configurable: true,
      value: (id: number) => clearTimeout(id),
    });
  }
  context = vm.createContext({
    document,
    window: jsdomWindow,
    console,
    localStorage: jsdomWindow.localStorage,
    requestAnimationFrame: jsdomWindow.requestAnimationFrame.bind(jsdomWindow),
    cancelAnimationFrame: jsdomWindow.cancelAnimationFrame.bind(jsdomWindow),
  });
  for (const file of SCRIPTS) {
    const source = await readFile(path.join(publicDir, file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
});

describe("renderRichText with the presentation engine", () => {
  it("renders fenced code with syntax highlighting (regression: the toLower crash)", () => {
    const host = newHost();
    scriptFn("renderRichText")(host, "Before.\n\n```js\nconst x = 1;\n```\n\nAfter.");
    expect(host.dataset.renderer).toBe("presentation");
    expect(host.querySelector("figure.code-block")).not.toBeNull();
    expect(host.querySelector(".tok-keyword")?.textContent).toBe("const");
    expect(host.querySelector(".tok-number")?.textContent).toBe("1");
    // The crash used to land the whole message in the raw-text error boundary.
    expect(host.textContent).toContain("Before.");
  });

  it("renders tables, callouts, steps, and comparisons as components", () => {
    const host = newHost();
    const text = [
      "## Results",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "> **Tip**: careful",
      "",
      "1. First step",
      "",
      "## SQLite vs Postgres",
      "",
      "| Option | Notes |",
      "| ------ | ----- |",
      "| SQLite | easy |",
    ].join("\n");
    scriptFn("renderRichText")(host, text);
    expect(host.dataset.renderer).toBe("presentation");
    expect(host.querySelector("h3")?.textContent).toBe("Results");
    expect(host.querySelector("table.pb-table td")?.textContent).toBe("1");
    expect(host.querySelector(".pb-callout")?.getAttribute("data-tone")).toBe("tip");
    expect(host.querySelector("ol.pb-steps li")?.textContent).toContain("First step");
    expect(host.querySelectorAll(".pb-comparison-col")).toHaveLength(2);
    expect(host.querySelector(".pb-comparison-title")?.textContent).toBe("SQLite vs Postgres");
  });

  it("memoizes blocks across renders and keeps earlier nodes while streaming", () => {
    const host = newHost();
    const render = scriptFn("renderRichText");
    const first = "One.\n\n```js\nconst a = 1;\n```\n";
    render(host, first);
    const leading = host.querySelector(":scope > .md")?.firstElementChild;
    expect(leading).not.toBeNull();

    render(host, first);
    expect(host.querySelector(":scope > .md")?.firstElementChild).toBe(leading);

    render(host, `${first}\nTwo.`);
    expect(host.querySelector(":scope > .md")?.firstElementChild).toBe(leading);
    expect(host.textContent).toContain("Two.");
  });

  it("falls back to Markdown when the engine declines", () => {
    const host = newHost();
    const original = Reflect.get(context, "renderPresentationInto");
    try {
      Reflect.set(context, "renderPresentationInto", () => false);
      scriptFn("renderRichText")(host, "plain **text**");
      expect(host.dataset.renderer).toBe("markdown");
      expect(host.querySelector(".md strong")?.textContent).toBe("text");
    } finally {
      Reflect.set(context, "renderPresentationInto", original);
    }
  });

  it("declines a structured envelope with unsafe image URLs and renders no img", () => {
    const host = newHost();
    const text = [
      "```presentation",
      JSON.stringify({
        version: 1,
        mode: "structured",
        blocks: [{ type: "gallery", items: [{ src: "javascript:alert(1)", alt: "x" }] }],
      }),
      "```",
    ].join("\n");
    scriptFn("renderRichText")(host, text);
    expect(host.dataset.renderer).toBe("markdown");
    expect(host.querySelector("img")).toBeNull();
  });

  it("keeps unsafe citation links as inert text", () => {
    const host = newHost();
    scriptFn("renderRichText")(host, "## Sources\n\n- [bad](javascript:alert(1))");
    expect(host.dataset.renderer).toBe("presentation");
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector(".pb-citation-label")?.textContent).toBe("bad");
  });

  it("renders every block type the parser can produce", () => {
    const host = newHost();
    const text = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "## Opt A vs Opt B",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "| K | V |",
      "| - | - |",
      "| k | v |",
      "",
      "- bullet",
      "",
      "1. step",
      "",
      "> **Warning**: careful",
      "",
      "```mermaid",
      "graph TD;",
      "```",
      "",
      "```chart",
      '{"kind":"bar","series":[{"name":"s","values":[1]}]}',
      "```",
      "",
      "```gallery",
      '{"items":[{"src":"https://x.example/a.png","alt":"a"}]}',
      "```",
      "",
      "```interactive",
      '{"kind":"poll","label":"Vote"}',
      "```",
      "",
      "```ts",
      "const a = 1;",
      "```",
      "",
      "## Sources",
      "",
      "- [docs](https://x.example/docs)",
    ].join("\n");
    scriptFn("renderRichText")(host, text);
    expect(host.dataset.renderer).toBe("presentation");
    expect(host.querySelector("h3")?.textContent).toBe("Title");
    expect(host.querySelector(".pb-prose")).not.toBeNull();
    expect(host.querySelector(".pb-comparison")).not.toBeNull();
    expect(host.querySelectorAll("table.pb-table")).toHaveLength(1);
    expect(host.querySelector("ul.pb-prose-list li")?.textContent).toBe("bullet");
    expect(host.querySelector("ol.pb-steps")).not.toBeNull();
    expect(host.querySelector('.pb-callout[data-tone="warning"]')).not.toBeNull();
    expect(host.querySelector(".pb-diagram")?.textContent).toContain("not executed");
    expect(host.querySelector(".pb-chart svg")).not.toBeNull();
    expect(host.querySelector(".pb-gallery img")?.getAttribute("src")).toBe("https://x.example/a.png");
    expect(host.querySelector(".pb-interactive")?.getAttribute("data-kind")).toBe("poll");
    expect(host.querySelector("figure.code-block")).not.toBeNull();
    expect(host.querySelector(".pb-citation a")?.getAttribute("href")).toBe("https://x.example/docs");
  });
});
