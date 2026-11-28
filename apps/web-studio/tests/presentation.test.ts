import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import { presentationEnvelopeSchema, type PresentationEnvelope } from "../src/presentation-blocks.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

type ScriptApi = {
  parsePresentation: (text: string) => unknown;
  validatePresentationEnvelope: (value: unknown) => unknown;
};

function readFn(context: object, name: string): (...args: unknown[]) => unknown {
  const value = Reflect.get(context, name);
  if (typeof value !== "function") throw new Error(`app-presentation.js does not define ${name}`);
  return value as (...args: unknown[]) => unknown;
}

function readErrors(result: unknown): string[] {
  if (!Array.isArray(result) || !result.every((entry) => typeof entry === "string")) {
    throw new Error("validatePresentationEnvelope must return string[]");
  }
  return result;
}

async function loadParser(): Promise<ScriptApi> {
  const source = await readFile(path.join(publicDir, "app-presentation.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: "app-presentation.js" });
  return {
    parsePresentation: readFn(context, "parsePresentation"),
    validatePresentationEnvelope: readFn(context, "validatePresentationEnvelope"),
  };
}

const parser = await loadParser();

/** Parse through the browser script, then re-validate with the Zod contract. */
function parse(text: string): PresentationEnvelope {
  return presentationEnvelopeSchema.parse(structuredClone(parser.parsePresentation(text)));
}

function browserErrors(value: unknown): string[] {
  return readErrors(parser.validatePresentationEnvelope(value));
}

const MARKDOWN_FIXTURE = [
  "# Project Atlas",
  "",
  "We rebuilt the pipeline for **speed**.",
  "",
  "## SQLite vs Postgres",
  "",
  "| Concern | SQLite |",
  "| -------- | ------ |",
  "| Setup | none |",
  "| Scaling | single node |",
  "",
  "- zero config",
  "- single file",
  "",
  "1. **Install**: run the installer",
  "2. Verify the output",
  "",
  "> **Warning**: Do not run this in production.",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "| Name | Value |",
  "| ---- | ----- |",
  "| port | 8080 |",
  "",
  "## Sources",
  "",
  "- [Authenik8 docs](https://authenik8.dev/docs)",
  "- Plain reference",
].join("\n");

describe("presentation parser", () => {
  it("normalizes a full Markdown answer into typed blocks", () => {
    const envelope = parse(MARKDOWN_FIXTURE);
    expect(envelope.version).toBe(1);
    expect(envelope.mode).toBe("markdown");
    expect(envelope.partial).toBeUndefined();
    expect(envelope.blocks.map((block) => block.type)).toEqual([
      "heading",
      "prose",
      "comparison",
      "prose",
      "steps",
      "callout",
      "code",
      "table",
      "citation",
    ]);

    expect(envelope.blocks[0]).toEqual({ type: "heading", level: 1, text: "Project Atlas" });
    expect(envelope.blocks[1]).toEqual({ type: "prose", content: "We rebuilt the pipeline for **speed**." });

    const comparison = envelope.blocks[2];
    if (comparison?.type !== "comparison") throw new Error("expected a comparison block");
    expect(comparison.title).toBe("SQLite vs Postgres");
    expect(comparison.columns).toEqual([
      { label: "Concern", items: ["Setup", "Scaling"] },
      { label: "SQLite", items: ["none", "single node"] },
    ]);

    expect(envelope.blocks[3]).toEqual({ type: "prose", content: "- zero config\n- single file" });

    const steps = envelope.blocks[4];
    if (steps?.type !== "steps") throw new Error("expected a steps block");
    expect(steps.items).toEqual([
      { title: "Install", body: "run the installer" },
      { body: "Verify the output" },
    ]);

    expect(envelope.blocks[5]).toEqual({
      type: "callout",
      tone: "warning",
      title: "Warning",
      content: "Do not run this in production.",
    });
    expect(envelope.blocks[6]).toEqual({ type: "code", language: "ts", code: "const x = 1;" });
    expect(envelope.blocks[7]).toEqual({
      type: "table",
      headers: ["Name", "Value"],
      rows: [["port", "8080"]],
    });

    const citation = envelope.blocks[8];
    if (citation?.type !== "citation") throw new Error("expected a citation block");
    expect(citation.title).toBe("Sources");
    expect(citation.items).toEqual([
      { label: "Authenik8 docs", url: "https://authenik8.dev/docs" },
      { label: "Plain reference" },
    ]);
  });

  it("reads structured data fences into chart, diagram, gallery, and interactive blocks", () => {
    const text = [
      "```chart",
      '{"kind":"bar","title":"Runs","labels":["Mon","Tue"],"series":[{"name":"ok","values":[3,5]}]}',
      "```",
      "",
      "```mermaid",
      "graph TD; A-->B;",
      "```",
      "",
      "```gallery",
      '{"items":[{"src":"https://example.com/a.png","alt":"A","caption":"Shot"}]}',
      "```",
      "",
      "```interactive",
      '{"kind":"poll","label":"Vote"}',
      "```",
    ].join("\n");
    const envelope = parse(text);
    expect(envelope.blocks.map((block) => block.type)).toEqual(["chart", "diagram", "gallery", "interactive"]);
    const chart = envelope.blocks[0];
    if (chart?.type !== "chart") throw new Error("expected a chart block");
    expect(chart.kind).toBe("bar");
    expect(chart.title).toBe("Runs");
    expect(chart.labels).toEqual(["Mon", "Tue"]);
    expect(chart.series).toEqual([{ name: "ok", values: [3, 5] }]);
  });

  it("drops unsafe gallery URLs instead of rendering them", () => {
    const unsafe = parse([
      "```gallery",
      '{"items":[{"src":"javascript:alert(1)","alt":"bad"}]}',
      "```",
    ].join("\n"));
    expect(unsafe.blocks[0]?.type).toBe("code");

    const mixed = parse([
      "```gallery",
      '{"items":[{"src":"javascript:alert(1)","alt":"bad"},{"src":"https://ok.example/x.png","alt":"good"}]}',
      "```",
    ].join("\n"));
    const gallery = mixed.blocks[0];
    if (gallery?.type !== "gallery") throw new Error("expected a gallery block");
    expect(gallery.items).toEqual([{ src: "https://ok.example/x.png", alt: "good" }]);
  });

  it("falls back to a code block when a structured fence is not valid JSON", () => {
    const envelope = parse(["```chart", "{not json}", "```"].join("\n"));
    expect(envelope.mode).toBe("markdown");
    expect(envelope.blocks[0]).toEqual({ type: "code", language: "chart", code: "{not json}" });
  });

  it("accepts a whole-message structured envelope and rejects an invalid one", () => {
    const valid = [
      "```presentation",
      JSON.stringify({
        version: 1,
        mode: "structured",
        blocks: [
          { type: "heading", level: 2, text: "Plan" },
          { type: "prose", content: "First." },
        ],
      }),
      "```",
    ].join("\n");
    const envelope = parse(valid);
    expect(envelope.mode).toBe("structured");
    expect(envelope.blocks.map((block) => block.type)).toEqual(["heading", "prose"]);

    const invalid = ["```presentation", '{"version":1,"mode":"structured","blocks":"nope"}', "```"].join("\n");
    const fallback = parse(invalid);
    expect(fallback.mode).toBe("markdown");
    expect(fallback.blocks[0]).toEqual({ type: "code", language: "presentation", code: '{"version":1,"mode":"structured","blocks":"nope"}' });
  });

  it("treats a raw JSON envelope as structured and other JSON as Markdown", () => {
    const raw = JSON.stringify({ version: 1, mode: "markdown", blocks: [{ type: "prose", content: "hi" }] });
    expect(parse(raw).mode).toBe("markdown");

    const notAnEnvelope = '{"hello":"world"}';
    const fallback = parse(notAnEnvelope);
    expect(fallback.mode).toBe("markdown");
    expect(fallback.blocks[0]?.type).toBe("prose");
  });
});

describe("presentation streaming safety", () => {
  it("parses every prefix of the fixture without throwing and keeps Zod valid", () => {
    for (let end = 0; end <= MARKDOWN_FIXTURE.length; end++) {
      const envelope = parse(MARKDOWN_FIXTURE.slice(0, end));
      expect(envelope.version).toBe(1);
    }
  });

  it("emits the code seen so far with partial: true while a fence is open", () => {
    const open = parse("```js\nconst x =");
    expect(open.partial).toBe(true);
    expect(open.blocks[0]).toEqual({ type: "code", language: "js", code: "const x =" });

    const closed = parse("```js\nconst x =\n```");
    expect(closed.partial).toBeUndefined();
    expect(closed.blocks[0]).toEqual({ type: "code", language: "js", code: "const x =" });
  });

  it("emits a table with the rows received so far", () => {
    const partial = parse("| Name | Value |\n| ---- | ----- |\n| port |");
    expect(partial.blocks[0]).toEqual({
      type: "table",
      headers: ["Name", "Value"],
      rows: [["port"]],
    });
  });
});

describe("browser validator and Zod contract parity", () => {
  const validEnvelopes: unknown[] = [
    { version: 1, mode: "markdown", blocks: [] },
    { version: 1, mode: "structured", blocks: [], partial: false },
    { version: 1, mode: "markdown", blocks: [], extra: "ignored" },
    {
      version: 1,
      mode: "structured",
      blocks: [
        { type: "heading", level: 3, text: "T" },
        { type: "prose", content: "p" },
        { type: "comparison", title: "A vs B", columns: [{ label: "A", items: ["1"] }, { label: "B", items: ["2"] }] },
        { type: "table", headers: ["H"], rows: [["v"]] },
        { type: "chart", kind: "line", series: [{ name: "s", values: [1, 2] }] },
        { type: "steps", items: [{ body: "b" }] },
        { type: "diagram", format: "mermaid", source: "graph TD;" },
        { type: "gallery", items: [{ src: "https://x.example/a.png", alt: "a" }] },
        { type: "callout", tone: "tip", content: "c" },
        { type: "citation", items: [{ label: "L", url: "https://x.example" }] },
        { type: "code", language: "ts", code: "const a = 1;" },
        { type: "interactive", kind: "poll", label: "Vote", config: { choices: ["a", "b"] } },
      ],
    },
  ];

  const invalidEnvelopes: unknown[] = [
    null,
    "envelope",
    {},
    { version: 2, mode: "markdown", blocks: [] },
    { version: 1, mode: "fancy", blocks: [] },
    { version: 1, mode: "markdown", blocks: "nope" },
    { version: 1, mode: "markdown", blocks: [null] },
    { version: 1, mode: "markdown", blocks: [{ type: "mystery" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "heading", level: 7, text: "x" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "heading", level: "2", text: "x" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "heading", level: 2 }] },
    { version: 1, mode: "markdown", blocks: [{ type: "prose" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "table", headers: [], rows: [] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "callout", tone: "meh", content: "" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "steps", items: [] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "chart", kind: "pie", series: [{ name: "s", values: [1] }] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "chart", kind: "bar", series: [] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "chart", kind: "bar", series: [{ name: "s", values: ["1"] }] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "citation", items: [] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "citation", items: [{ label: "" }] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "comparison", columns: [{ label: "A", items: ["1"] }] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "gallery", items: [] }] },
    { version: 1, mode: "markdown", blocks: [{ type: "interactive", kind: "" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "diagram", format: "graphviz", source: "" }] },
    { version: 1, mode: "markdown", blocks: [{ type: "code", language: "ts", code: 5 }] },
    { version: 1, mode: "markdown", blocks: [], partial: "yes" },
  ];

  it("accepts every valid envelope in both implementations", () => {
    for (const envelope of validEnvelopes) {
      expect(presentationEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect(browserErrors(envelope)).toEqual([]);
    }
  });

  it("rejects every invalid envelope in both implementations", () => {
    for (const envelope of invalidEnvelopes) {
      const zodValid = presentationEnvelopeSchema.safeParse(envelope).success;
      const browserValid = browserErrors(envelope).length === 0;
      expect(zodValid, `envelope: ${JSON.stringify(envelope)}`).toBe(false);
      expect(browserValid, `envelope: ${JSON.stringify(envelope)}`).toBe(false);
    }
  });
});

describe("presentation wiring", () => {
  it("renders through the presentation engine with a Markdown fallback in renderRichText", async () => {
    const ui = await readFile(path.join(publicDir, "app-ui.js"), "utf8");
    const markdown = await readFile(path.join(publicDir, "app-markdown.js"), "utf8");
    const source = `${ui}\n${markdown}`;
    expect(source).toContain("renderPresentationInto(md, clean)");
    expect(source).toContain('md.dataset.pbSignature = ""');
  });

  it("keeps the code highlighter free of the toLower crash", async () => {
    // Regression: String.prototype.toLower does not exist, so every closed
    // code fence threw inside highlightCode and renderRichText dumped the
    // whole message as raw text (the unreadable-wall bug).
    const ui = await readFile(path.join(publicDir, "app-ui.js"), "utf8");
    const markdown = await readFile(path.join(publicDir, "app-markdown.js"), "utf8");
    const source = `${ui}\n${markdown}`;
    expect(source).not.toContain(".toLower()");
    expect(source).toContain(".toLowerCase()");
  });

  it("registers both presentation scripts in the server and the page", async () => {
    const staticSource = await readFile(path.join(publicDir, "..", "src", "routes", "static.ts"), "utf8");
    expect(staticSource).toContain('"presentation"');
    expect(staticSource).toContain('"presentation-render"');
    const html = await readFile(path.join(publicDir, "index.html"), "utf8");
    expect(html).toContain('<script src="/studio/app-presentation.js"></script>');
    expect(html).toContain('<script src="/studio/app-presentation-render.js"></script>');
  });
});
