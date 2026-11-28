// Adaptive Presentation Engine: turns assistant text into canonical
// PresentationBlock envelopes. Pure data: no DOM, and nothing here evaluates
// model content. Structured fences are parsed as JSON and validated field by
// field before any of their blocks are used.
//
// The canonical contract is src/presentation-blocks.ts (Zod). Studio ships
// unbundled classic scripts, so the browser cannot run Zod; this file carries
// a structural mirror of that contract. tests/presentation.test.ts feeds
// identical fixtures to both so the definitions cannot drift.

/** Fences whose JSON payload is a structured presentation envelope. */
function presentationFenceLanguage(language) {
  return language === "presentation" || language === "a8-presentation";
}

function pbIsObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pbCheck(pairs) {
  const errors = [];
  for (const pair of pairs) {
    if (!pair[0]) errors.push(pair[1]);
  }
  return errors;
}

function pbParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null; // Not JSON: callers fall back to plain Markdown.
  }
}

const PB_BLOCK_VALIDATORS = {
  heading: (block) => pbCheck([
    [Number.isInteger(block.level) && block.level >= 1 && block.level <= 6, "level must be an integer from 1 to 6"],
    [typeof block.text === "string", "text must be a string"],
  ]),
  prose: (block) => pbCheck([[typeof block.content === "string", "content must be a string"]]),
  comparison: (block) => {
    const errors = pbCheck([
      [block.title === undefined || typeof block.title === "string", "title must be a string"],
      [Array.isArray(block.columns) && block.columns.length >= 2 && block.columns.length <= 4, "columns must contain 2 to 4 entries"],
    ]);
    if (!Array.isArray(block.columns)) return errors;
    for (const column of block.columns) {
      if (!pbIsObject(column)) { errors.push("column must be an object"); continue; }
      if (typeof column.label !== "string" || column.label.length === 0) errors.push("column label must be a non-empty string");
      if (!Array.isArray(column.items) || column.items.length < 1 || !column.items.every((item) => typeof item === "string")) {
        errors.push("column items must be a non-empty string array");
      }
    }
    return errors;
  },
  table: (block) => pbCheck([
    [block.caption === undefined || typeof block.caption === "string", "caption must be a string"],
    [Array.isArray(block.headers) && block.headers.length >= 1 && block.headers.every((header) => typeof header === "string"), "headers must be a non-empty string array"],
    [Array.isArray(block.rows) && block.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")), "rows must be an array of string arrays"],
  ]),
  chart: (block) => pbCheck([
    [block.title === undefined || typeof block.title === "string", "title must be a string"],
    [block.kind === "bar" || block.kind === "line" || block.kind === "area", 'kind must be "bar", "line", or "area"'],
    [block.labels === undefined || (Array.isArray(block.labels) && block.labels.every((label) => typeof label === "string")), "labels must be a string array"],
    [
      Array.isArray(block.series) && block.series.length >= 1 && block.series.every((series) => pbIsObject(series)
        && typeof series.name === "string"
        && Array.isArray(series.values)
        && series.values.every((value) => typeof value === "number" && Number.isFinite(value))),
      "series must be a non-empty array of { name, values: number[] }",
    ],
  ]),
  steps: (block) => pbCheck([
    [Array.isArray(block.items) && block.items.length >= 1 && block.items.every((item) => pbIsObject(item)
      && (item.title === undefined || typeof item.title === "string")
      && typeof item.body === "string"), "items must be a non-empty array of { title?, body }"],
  ]),
  diagram: (block) => pbCheck([
    [block.format === "mermaid" || block.format === "ascii", 'format must be "mermaid" or "ascii"'],
    [typeof block.source === "string", "source must be a string"],
  ]),
  gallery: (block) => pbCheck([
    [Array.isArray(block.items) && block.items.length >= 1 && block.items.every((item) => pbIsObject(item)
      && typeof item.src === "string" && item.src.length >= 1
      && typeof item.alt === "string"
      && (item.caption === undefined || typeof item.caption === "string")), "items must be a non-empty array of { src, alt, caption? }"],
  ]),
  callout: (block) => pbCheck([
    [block.tone === "note" || block.tone === "tip" || block.tone === "warning" || block.tone === "danger", "tone must be note, tip, warning, or danger"],
    [block.title === undefined || typeof block.title === "string", "title must be a string"],
    [typeof block.content === "string", "content must be a string"],
  ]),
  citation: (block) => pbCheck([
    [block.title === undefined || typeof block.title === "string", "title must be a string"],
    [Array.isArray(block.items) && block.items.length >= 1 && block.items.every((item) => pbIsObject(item)
      && typeof item.label === "string" && item.label.length >= 1
      && (item.url === undefined || typeof item.url === "string")), "items must be a non-empty array of { label, url? }"],
  ]),
  code: (block) => pbCheck([
    [typeof block.language === "string", "language must be a string"],
    [typeof block.code === "string", "code must be a string"],
    [block.filename === undefined || typeof block.filename === "string", "filename must be a string"],
  ]),
  interactive: (block) => pbCheck([
    [typeof block.kind === "string" && block.kind.length >= 1, "kind must be a non-empty string"],
    [block.label === undefined || typeof block.label === "string", "label must be a string"],
    [block.config === undefined || pbIsObject(block.config), "config must be an object"],
  ]),
};

function pbBlockErrors(block) {
  if (!pbIsObject(block)) return ["block must be an object"];
  const validate = PB_BLOCK_VALIDATORS[block.type];
  if (typeof validate !== "function") return [`unknown block type ${JSON.stringify(block.type ?? null)}`];
  return validate(block);
}

/**
 * Structural mirror of presentationEnvelopeSchema: returns the list of
 * contract violations ([] when the envelope is valid).
 */
function validatePresentationEnvelope(value) {
  if (!pbIsObject(value)) return ["envelope must be an object"];
  const errors = pbCheck([
    [value.version === 1, "version must be 1"],
    [value.mode === "markdown" || value.mode === "structured", 'mode must be "markdown" or "structured"'],
    [Array.isArray(value.blocks), "blocks must be an array"],
    [value.partial === undefined || typeof value.partial === "boolean", "partial must be a boolean"],
  ]);
  if (Array.isArray(value.blocks)) {
    value.blocks.forEach((block, index) => {
      for (const error of pbBlockErrors(block)) errors.push(`blocks[${index}]: ${error}`);
    });
  }
  return errors;
}

/**
 * Whole-message structured envelope: either one ```presentation fence or the
 * raw JSON envelope itself. Returns the envelope when it validates, else null
 * (the caller falls back to Markdown).
 */
function detectStructuredPresentation(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return null;
  let candidate = null;
  const fence = /^\s*(?:```|~~~)\s*(?:presentation|a8-presentation)\s*\n([\s\S]*?)\n?\s*(?:```|~~~)\s*$/.exec(trimmed);
  if (fence !== null) candidate = fence[1];
  else if (trimmed.startsWith("{")) candidate = trimmed;
  if (candidate === null) return null;
  const parsed = pbParseJson(candidate);
  if (parsed === null) return null;
  return validatePresentationEnvelope(parsed).length === 0 ? parsed : null;
}

/** Split one GFM table row into trimmed cells (leading/trailing pipe removed). */
function pbSplitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

/** True when index starts a GFM table: pipe header over a dash separator row. */
function pbTableStart(lines, index) {
  if (index + 1 >= lines.length) return null;
  const header = lines[index];
  if (!header.includes("|")) return null;
  if (!pbSplitRow(header).some((cell) => cell !== "")) return null;
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(lines[index + 1]);
}

const PB_COMPARISON_HEADING = /\bvs\.?\b|\bversus\b|\bcompar(?:e|ison)\b/i;
const PB_CITATION_HEADING = /^(sources?|references?|citations?)\s*[:：]?\s*$/i;
const PB_CALLOUT_WORDS = /^\*\*(Note|Tip|Warning|Important|Caution|Danger)\*\*\s*[:：]?\s*/i;

/** Collect a contiguous list block; indented continuations join the last item. */
function pbCollectList(lines, start, pattern) {
  const items = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (pattern.test(line)) {
      items.push(line.replace(pattern, ""));
      index++;
      continue;
    }
    if (line.trim() !== "" && /^\s{2,}/.test(line) && items.length > 0) {
      items[items.length - 1] += " " + line.trim();
      index++;
      continue;
    }
    break;
  }
  return { items, next: index };
}

/** Pull a bold lead-in ("**Title**: rest") out of one step item. */
function pbStepItem(raw) {
  const text = raw.trim();
  const lead = /^\*\*([^*]+)\*\*\s*[:：]\s*(.*)$/.exec(text);
  if (lead !== null) return { title: lead[1].trim(), body: lead[2].trim() };
  return { body: text };
}

/** Quote lines into a callout block, reading tone and title from the lead. */
function pbCalloutFromLines(quoted) {
  let tone = "note";
  let title;
  let first = quoted[0] ?? "";
  const emoji = /^\s*(⚠️|⚠|💡|ℹ️|ℹ|❗|🛑|✅)\s*/.exec(first);
  if (emoji !== null) {
    const mark = emoji[1];
    tone = mark === "💡" ? "tip" : mark === "🛑" ? "danger" : mark === "⚠️" || mark === "⚠" || mark === "❗" ? "warning" : "note";
    first = first.slice(emoji[0].length);
  }
  const word = PB_CALLOUT_WORDS.exec(first);
  if (word !== null) {
    const key = word[1].toLowerCase();
    tone = key === "tip" ? "tip" : key === "note" ? "note" : key === "danger" ? "danger" : "warning";
    title = word[1].charAt(0).toUpperCase() + word[1].slice(1).toLowerCase();
    first = first.slice(word[0].length);
  }
  const lines = [first, ...quoted.slice(1)];
  const content = lines.join("\n").trim();
  const block = { type: "callout", tone, content };
  if (title !== undefined && title !== "") block.title = title;
  return block;
}

/** Build a citation block from raw list items; null when nothing is citable. */
function pbCitationBlock(title, rawItems) {
  const items = [];
  for (const raw of rawItems) {
    const text = raw.trim();
    if (text === "") continue;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text);
    if (link !== null) {
      items.push({ label: link[1].trim(), url: link[2] });
      continue;
    }
    const bare = /https?:\/\/[^\s)]+/.exec(text);
    if (bare !== null) {
      items.push({ label: bare[0], url: bare[0] });
      continue;
    }
    const label = text.replace(/\*\*|__/g, "").trim();
    if (label !== "") items.push({ label });
  }
  if (items.length === 0) return null;
  const block = { type: "citation", items };
  if (title !== undefined && title !== "") block.title = title;
  return block;
}

/** Two-column table under a "vs"/comparison heading becomes a comparison. */
function pbComparisonBlock(title, headers, rows) {
  const columns = [headers[0], headers[1]].map((label, columnIndex) => ({
    label,
    items: rows.map((row) => row[columnIndex] ?? ""),
  }));
  return { type: "comparison", title, columns };
}

/**
 * Structured data fences: chart / gallery / interactive JSON plus mermaid and
 * ascii diagrams. Invalid payloads return null so the fence renders as code.
 * Diagrams are stored as inert source: nothing here executes them.
 */
function pbStructuredDataBlock(language, payload) {
  if (language === "mermaid" || language === "ascii") {
    return { type: "diagram", format: language, source: payload };
  }
  if (language === "chart") {
    const value = pbParseJson(payload);
    if (!pbIsObject(value)) return null;
    const kind = value.kind === "line" || value.kind === "area" ? value.kind : "bar";
    const series = [];
    if (Array.isArray(value.series)) {
      for (const entry of value.series) {
        if (!pbIsObject(entry) || typeof entry.name !== "string" || !Array.isArray(entry.values)) return null;
        if (!entry.values.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
        series.push({ name: entry.name, values: entry.values });
      }
    }
    if (series.length === 0) return null;
    const block = { type: "chart", kind, series };
    if (typeof value.title === "string") block.title = value.title;
    if (Array.isArray(value.labels) && value.labels.every((label) => typeof label === "string")) {
      block.labels = value.labels;
    }
    return block;
  }
  if (language === "gallery") {
    const value = pbParseJson(payload);
    if (!pbIsObject(value) || !Array.isArray(value.items)) return null;
    const items = [];
    for (const item of value.items) {
      if (!pbIsObject(item) || typeof item.src !== "string" || item.src.length === 0) continue;
      if (!pbGalleryUrl(item.src)) continue; // Drop unsafe schemes outright.
      const entry = { src: item.src, alt: typeof item.alt === "string" ? item.alt : "" };
      if (typeof item.caption === "string") entry.caption = item.caption;
      items.push(entry);
    }
    if (items.length === 0) return null;
    return { type: "gallery", items };
  }
  if (language === "interactive") {
    const value = pbParseJson(payload);
    if (!pbIsObject(value) || typeof value.kind !== "string" || value.kind.length === 0) return null;
    const block = { type: "interactive", kind: value.kind };
    if (typeof value.label === "string") block.label = value.label;
    if (pbIsObject(value.config)) block.config = value.config;
    return block;
  }
  return null;
}

/** Absolute http(s) image URLs, or base64 image data URLs. */
function pbGalleryUrl(url) {
  if (/^https?:\/\/[^\s]+$/i.test(url)) return true;
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url);
}

function pbMdFlushParagraph(state) {
  if (state.paragraph.length === 0) return;
  const content = state.paragraph.join("\n").trim();
  state.paragraph = [];
  if (content === "") return;
  pbMdFlushHeading(state);
  state.blocks.push({ type: "prose", content });
}

function pbMdFlushHeading(state) {
  if (state.pendingHeading === null) return;
  const heading = state.pendingHeading;
  state.pendingHeading = null;
  state.blocks.push({ type: "heading", level: heading.level, text: heading.text });
}

function pbMdReadFence(lines, index, state) {
  const fence = /^\s*(```|~~~)\s*([\w#+.-]*)\s*$/.exec(lines[index]);
  const marker = fence[1];
  const language = (fence[2] || "").toLowerCase();
  const closer = new RegExp(`^\\s*${marker}\\s*$`);
  const body = [];
  let i = index + 1;
  while (i < lines.length && !closer.test(lines[i])) { body.push(lines[i]); i++; }
  if (i < lines.length) i++; else state.partial = true;
  const payload = body.join("\n");
  if (presentationFenceLanguage(language)) {
    const envelope = pbParseJson(payload);
    if (envelope !== null && validatePresentationEnvelope(envelope).length === 0) {
      state.structuredUsed = true;
      for (const block of envelope.blocks) state.blocks.push(block);
      return i;
    }
  }
  const special = pbStructuredDataBlock(language, payload);
  state.blocks.push(special !== null ? special : { type: "code", language, code: payload });
  return i;
}

function pbMdReadBlockquote(lines, index, state) {
  const quoted = [];
  let i = index;
  while (i < lines.length && /^\s*>/.test(lines[i])) { quoted.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
  state.blocks.push(pbCalloutFromLines(quoted));
  return i;
}

function pbMdReadTable(lines, index, state) {
  const headers = pbSplitRow(lines[index]);
  let i = index + 2;
  const rows = [];
  while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) { rows.push(pbSplitRow(lines[i])); i++; }
  const heading = state.pendingHeading;
  const comparable = heading !== null && !heading.citation && PB_COMPARISON_HEADING.test(heading.text)
    && headers.length === 2 && headers[0] !== "" && headers[1] !== "" && rows.length > 0;
  if (comparable) { state.pendingHeading = null; state.blocks.push(pbComparisonBlock(heading.text, headers, rows)); }
  else { pbMdFlushHeading(state); state.blocks.push({ type: "table", headers, rows }); }
  return i;
}

function pbMdReadList(lines, index, state) {
  const ordered = /^\s*\d+[.)]\s+/.test(lines[index]);
  const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const collected = pbCollectList(lines, index, pattern);
  if (state.pendingHeading !== null && state.pendingHeading.citation) {
    const citation = pbCitationBlock(state.pendingHeading.text, collected.items);
    if (citation !== null) { state.pendingHeading = null; state.blocks.push(citation); return collected.next; }
  }
  pbMdFlushHeading(state);
  if (ordered) {
    const items = collected.items.map(pbStepItem);
    if (items.length > 0) state.blocks.push({ type: "steps", items });
  } else {
    state.blocks.push({ type: "prose", content: collected.items.map((item) => `- ${item}`).join("\n") });
  }
  return collected.next;
}

/**
 * Markdown to blocks. Total function: any text produces a valid envelope, so
 * the renderer only declines when a block fails contract validation or has no
 * registered renderer, and renderRichText falls back to plain Markdown then.
 *
 * Streaming-safe: parsing is deterministic over the accumulated text, an
 * unclosed fence still emits the code seen so far (partial: true), and only
 * the block currently being written changes between frames.
 */
function presentationFromMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const state = { blocks: [], paragraph: [], pendingHeading: null, structuredUsed: false, partial: false };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") { pbMdFlushParagraph(state); index++; continue; }
    if (/^\s*(```|~~~)\s*([\w#+.-]*)\s*$/.test(line)) { pbMdFlushParagraph(state); pbMdFlushHeading(state); index = pbMdReadFence(lines, index, state); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      pbMdFlushParagraph(state);
      pbMdFlushHeading(state);
      const text0 = heading[2].trim();
      state.pendingHeading = { level: heading[1].length, text: text0, citation: PB_CITATION_HEADING.test(text0) };
      index++;
      continue;
    }
    if (/^\s*>/.test(line)) { pbMdFlushParagraph(state); pbMdFlushHeading(state); index = pbMdReadBlockquote(lines, index, state); continue; }
    if (pbTableStart(lines, index)) { pbMdFlushParagraph(state); index = pbMdReadTable(lines, index, state); continue; }
    if (/^\s*\d+[.)]\s+/.test(line) || /^\s*[-*+]\s+/.test(line)) { pbMdFlushParagraph(state); index = pbMdReadList(lines, index, state); continue; }
    if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line)) { pbMdFlushParagraph(state); pbMdFlushHeading(state); index++; continue; }
    state.paragraph.push(line);
    index++;
  }
  pbMdFlushParagraph(state);
  pbMdFlushHeading(state);
  const envelope = { version: 1, mode: state.structuredUsed ? "structured" : "markdown", blocks: state.blocks };
  if (state.partial) envelope.partial = true;
  return envelope;
}

/**
 * Canonical entry point: structured envelope when the message is one, else
 * Markdown normalized into blocks. Always returns a valid envelope.
 */
function parsePresentation(text) {
  const structured = detectStructuredPresentation(text);
  if (structured !== null) return structured;
  return presentationFromMarkdown(text);
}
