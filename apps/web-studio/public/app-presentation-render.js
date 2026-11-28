// Adaptive Presentation Engine: the renderer registry. Every renderer returns
// one Element, or null to decline, and renderPresentationInto turns a whole
// message into DOM with per-block memoization so streaming only rebuilds the
// block that changed. Model content is inserted with textContent or validated
// absolute URLs only: no model HTML, no model JS, no diagram execution.
//
// On any failure (unknown type, failed contract check, renderer decline or
// throw) renderPresentationInto returns false and renderRichText falls back
// to the plain Markdown renderer in app-ui.js.

const PRESENTATION_BLOCK_RENDERERS = Object.create(null);

function registerPresentationBlock(type, renderer) {
  PRESENTATION_BLOCK_RENDERERS[type] = renderer;
}

const presentationBlockCache = new WeakMap();

function pbElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className !== "") element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function pbInline(text) {
  if (typeof inlineNodes === "function") return inlineNodes(String(text));
  return [document.createTextNode(String(text))];
}

function pbAppendInline(element, text) {
  element.append(...pbInline(text));
}

/** Absolute http(s) and mailto links only; everything else stays inert text. */
function pbSafeUrl(url) {
  const value = String(url).trim();
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  if (/^mailto:[^\s@]+@[^\s]+$/i.test(value)) return value;
  return null;
}

/** Image sources: absolute http(s) or a base64 image data URL. */
function pbSafeImageUrl(url) {
  const value = String(url).trim();
  if (/^https?:\/\/[^\s]+$/i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)) return value;
  return null;
}

function pbSvgElement(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

const PB_CHART_COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--text-2)"];

function pbChartDrawBars(svg, block, count, scaleMax, padX, padTop, plotWidth, plotHeight, baseline) {
  const groupWidth = plotWidth / count;
  const barWidth = Math.max(2, (groupWidth * 0.7) / block.series.length);
  block.series.forEach((series, seriesIndex) => {
    series.values.forEach((value, i) => {
      const barHeight = Math.max(0, (value / scaleMax) * plotHeight);
      const rect = pbSvgElement("rect");
      rect.setAttribute("x", String(padX + i * groupWidth + groupWidth * 0.15 + seriesIndex * barWidth));
      rect.setAttribute("y", String(baseline - barHeight));
      rect.setAttribute("width", String(Math.max(1, barWidth - 1)));
      rect.setAttribute("height", String(barHeight));
      rect.setAttribute("rx", "1");
      rect.setAttribute("style", `fill:${PB_CHART_COLORS[seriesIndex % PB_CHART_COLORS.length]}`);
      svg.appendChild(rect);
    });
  });
}

function pbChartDrawSeries(svg, block, count, scaleMax, padX, plotWidth, plotHeight, baseline) {
  const step = count > 1 ? plotWidth / (count - 1) : 0;
  block.series.forEach((series, seriesIndex) => {
    const points = series.values.map((value, i) => {
      const x = padX + i * step;
      const y = baseline - (value / scaleMax) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (points.length === 0) return;
    const color = PB_CHART_COLORS[seriesIndex % PB_CHART_COLORS.length];
    if (block.kind === "area" && points.length > 1) {
      const last = points[points.length - 1].split(",");
      const first = points[0].split(",");
      const polygon = pbSvgElement("polygon");
      polygon.setAttribute("points", `${points.join(" ")} ${last[0]},${baseline} ${first[0]},${baseline}`);
      polygon.setAttribute("style", `fill:${color};opacity:0.18`);
      svg.appendChild(polygon);
    }
    const shape = points.length > 1 ? pbSvgElement("polyline") : pbSvgElement("circle");
    if (points.length > 1) {
      shape.setAttribute("points", points.join(" "));
      shape.setAttribute("fill", "none");
      shape.setAttribute("stroke", color);
      shape.setAttribute("stroke-width", "1.5");
      shape.setAttribute("stroke-linejoin", "round");
    } else {
      const [cx, cy] = points[0].split(",");
      shape.setAttribute("cx", cx); shape.setAttribute("cy", cy); shape.setAttribute("r", "2.5");
      shape.setAttribute("style", `fill:${color}`);
    }
    svg.appendChild(shape);
  });
}

function pbChartDrawLabels(svg, labels, count, padX, width, height, plotWidth) {
  labels.forEach((label, i) => {
    if (count > 8 && i % Math.ceil(count / 8) !== 0) return;
    const text = pbSvgElement("text");
    text.setAttribute("x", String(padX + (i + 0.5) * (plotWidth / count)));
    text.setAttribute("y", String(height - 6));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "8");
    text.setAttribute("fill", "var(--text-3)");
    text.textContent = label;
    svg.appendChild(text);
  });
}

function pbChartSvg(block) {
  const width = 320;
  const height = 160;
  const padX = 8;
  const padTop = 12;
  const padBottom = 22;
  const labels = block.labels ?? [];
  const count = Math.max(block.series.reduce((max, series) => Math.max(max, series.values.length), 0), labels.length, 1);
  const scaleMax = Math.max(block.series.reduce((max, series) => Math.max(max, ...series.values), 0), 0) || 1;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padTop - padBottom;
  const baseline = padTop + plotHeight;

  const svg = pbSvgElement("svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", block.title ?? "Chart");

  const axis = pbSvgElement("line");
  axis.setAttribute("x1", String(padX)); axis.setAttribute("x2", String(width - padX));
  axis.setAttribute("y1", String(baseline)); axis.setAttribute("y2", String(baseline));
  axis.setAttribute("stroke", "var(--border)");
  svg.appendChild(axis);

  if (block.kind === "bar") pbChartDrawBars(svg, block, count, scaleMax, padX, padTop, plotWidth, plotHeight, baseline);
  else pbChartDrawSeries(svg, block, count, scaleMax, padX, plotWidth, plotHeight, baseline);
  pbChartDrawLabels(svg, labels, count, padX, width, height, plotWidth);
  return svg;
}

registerPresentationBlock("heading", (block) => {
  const tag = block.level >= 4 ? "h5" : block.level >= 3 ? "h4" : "h3";
  const heading = pbElement(tag, "pb pb-heading");
  heading.dataset.level = String(block.level);
  pbAppendInline(heading, block.text);
  return heading;
});

registerPresentationBlock("prose", (block) => {
  const wrap = pbElement("div", "pb pb-prose");
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const element = pbElement("p");
    pbAppendInline(element, paragraph.join("\n"));
    wrap.appendChild(element);
    paragraph = [];
  };
  for (const line of block.content.split("\n")) {
    if (line.trim() === "") {
      flushParagraph();
      list = null;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      if (list === null) {
        list = pbElement("ul", "pb-prose-list");
        wrap.appendChild(list);
      }
      const item = pbElement("li");
      pbAppendInline(item, line.replace(/^\s*[-*+]\s+/, ""));
      list.appendChild(item);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return wrap;
});

registerPresentationBlock("table", (block) => {
  const table = pbElement("table", "pb pb-table");
  if (block.caption !== undefined) table.appendChild(pbElement("caption", "", block.caption));
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of block.headers) {
    const cell = pbElement("th", "", header);
    cell.scope = "col";
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  table.appendChild(head);
  const body = document.createElement("tbody");
  for (const row of block.rows) {
    const tableRow = document.createElement("tr");
    for (const cellText of row) tableRow.appendChild(pbElement("td", "", cellText));
    body.appendChild(tableRow);
  }
  table.appendChild(body);
  return table;
});

registerPresentationBlock("steps", (block) => {
  const list = pbElement("ol", "pb pb-steps");
  for (const step of block.items) {
    const item = document.createElement("li");
    const body = pbElement("div", "pb-step-body");
    if (step.title !== undefined && step.title !== "") {
      const title = pbElement("div", "pb-step-title");
      pbAppendInline(title, step.title);
      body.appendChild(title);
    }
    const text = pbElement("div", "pb-step-text");
    pbAppendInline(text, step.body);
    body.appendChild(text);
    item.appendChild(body);
    list.appendChild(item);
  }
  return list;
});

const PB_CALLOUT_LABELS = { note: "Note", tip: "Tip", warning: "Warning", danger: "Danger" };

registerPresentationBlock("callout", (block) => {
  const wrap = pbElement("div", "pb pb-callout");
  wrap.dataset.tone = block.tone;
  const head = pbElement("div", "pb-callout-head");
  head.appendChild(pbElement("span", "pb-callout-badge", block.title ?? PB_CALLOUT_LABELS[block.tone]));
  wrap.appendChild(head);
  const body = pbElement("div", "pb-callout-body");
  for (const chunk of block.content.split(/\n{2,}/)) {
    if (chunk.trim() === "") continue;
    const paragraph = pbElement("p");
    pbAppendInline(paragraph, chunk.trim());
    body.appendChild(paragraph);
  }
  wrap.appendChild(body);
  return wrap;
});

registerPresentationBlock("citation", (block) => {
  const wrap = pbElement("div", "pb pb-citation");
  wrap.appendChild(pbElement("div", "pb-citation-title", block.title ?? "Sources"));
  const list = document.createElement("ol");
  for (const item of block.items) {
    const entry = document.createElement("li");
    const href = item.url === undefined ? null : pbSafeUrl(item.url);
    if (href === null) {
      const label = pbElement("span", "pb-citation-label");
      pbAppendInline(label, item.label);
      entry.appendChild(label);
    } else {
      const link = pbElement("a", "pb-citation-link");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      pbAppendInline(link, item.label);
      entry.appendChild(link);
    }
    list.appendChild(entry);
  }
  wrap.appendChild(list);
  return wrap;
});

registerPresentationBlock("comparison", (block) => {
  const wrap = pbElement("div", "pb pb-comparison");
  if (block.title !== undefined) {
    const title = pbElement("div", "pb-comparison-title");
    pbAppendInline(title, block.title);
    wrap.appendChild(title);
  }
  const columns = pbElement("div", "pb-comparison-cols");
  for (const column of block.columns) {
    const col = pbElement("div", "pb-comparison-col");
    const label = pbElement("div", "pb-comparison-label");
    pbAppendInline(label, column.label);
    col.appendChild(label);
    const list = document.createElement("ul");
    for (const item of column.items) {
      const entry = pbElement("li");
      pbAppendInline(entry, item);
      list.appendChild(entry);
    }
    col.appendChild(list);
    columns.appendChild(col);
  }
  wrap.appendChild(columns);
  return wrap;
});

registerPresentationBlock("chart", (block) => {
  const figure = pbElement("figure", "pb pb-chart");
  if (block.title !== undefined) {
    const caption = pbElement("figcaption", "pb-chart-title");
    pbAppendInline(caption, block.title);
    figure.appendChild(caption);
  }
  figure.appendChild(pbChartSvg(block));
  return figure;
});

registerPresentationBlock("diagram", (block) => {
  const figure = pbElement("figure", "pb pb-diagram");
  const caption = pbElement("figcaption", "pb-diagram-caption");
  caption.appendChild(pbElement("span", "pb-diagram-label", block.format));
  caption.appendChild(pbElement("span", "pb-diagram-note", "source only, not executed"));
  figure.appendChild(caption);
  const pre = document.createElement("pre");
  pre.appendChild(pbElement("code", "", block.source));
  figure.appendChild(pre);
  return figure;
});

registerPresentationBlock("gallery", (block) => {
  const grid = pbElement("div", "pb pb-gallery-grid");
  for (const item of block.items) {
    const href = pbSafeImageUrl(item.src);
    if (href === null) continue; // Second pass: never render an unsafe URL.
    const cell = document.createElement("figure");
    cell.className = "pb-gallery-item";
    const image = document.createElement("img");
    image.src = href;
    image.alt = item.alt;
    image.loading = "lazy";
    cell.appendChild(image);
    if (item.caption !== undefined) cell.appendChild(pbElement("figcaption", "pb-gallery-caption", item.caption));
    grid.appendChild(cell);
  }
  if (grid.childElementCount === 0) return null; // Nothing safe to show: decline.
  const figure = pbElement("figure", "pb pb-gallery");
  figure.appendChild(grid);
  return figure;
});

registerPresentationBlock("code", (block) => {
  if (typeof codeBlockNode === "function") {
    const figure = codeBlockNode(block.code, block.language, true);
    figure.classList.add("pb-code");
    return figure;
  }
  const figure = pbElement("figure", "pb pb-code code-block");
  const caption = pbElement("figcaption");
  caption.appendChild(pbElement("span", "", block.language === "" ? "code" : block.language));
  figure.appendChild(caption);
  const pre = document.createElement("pre");
  pre.appendChild(pbElement("code", "", block.code));
  figure.appendChild(pre);
  return figure;
});

registerPresentationBlock("interactive", (block) => {
  const wrap = pbElement("div", "pb pb-interactive");
  wrap.dataset.kind = block.kind;
  const head = pbElement("div", "pb-interactive-head");
  head.appendChild(pbElement("span", "pb-interactive-badge", "Interactive"));
  head.appendChild(pbElement("span", "pb-interactive-kind", block.kind));
  wrap.appendChild(head);
  if (block.label !== undefined) {
    const label = pbElement("p", "pb-interactive-label");
    pbAppendInline(label, block.label);
    wrap.appendChild(label);
  }
  wrap.appendChild(pbElement("p", "pb-interactive-note", "Inert in Studio: interactive blocks never execute model-provided code."));
  if (block.config !== undefined) {
    const details = document.createElement("details");
    details.appendChild(pbElement("summary", "", "Payload"));
    const pre = document.createElement("pre");
    pre.appendChild(pbElement("code", "", JSON.stringify(block.config, null, 2)));
    details.appendChild(pre);
    wrap.appendChild(details);
  }
  return wrap;
});

/**
 * Render one assistant message into host (the .md container). Returns true
 * when the presentation path owns the host, false to let the Markdown
 * fallback render it. Per-block memoization keeps streaming cheap: only the
 * block whose JSON changed is rebuilt. No entrance animation on purpose:
 * re-animating on every streaming frame would flicker.
 */
function renderPresentationInto(host, text) {
  try {
    const envelope = parsePresentation(text);
    if (validatePresentationEnvelope(envelope).length > 0) return false;
    const signature = JSON.stringify(envelope);
    if (host.dataset.pbSignature === signature) return true;
    const cached = presentationBlockCache.get(host);
    const canReuse = cached !== undefined && host.dataset.pbSignature === cached.signature;
    const keys = envelope.blocks.map((block) => JSON.stringify(block));
    const nodes = [];
    for (let i = 0; i < keys.length; i++) {
      // Reuse per block, even when the count grew: streaming appends blocks,
      // so everything before the new one must keep its identity.
      if (canReuse && cached.keys[i] === keys[i]) {
        nodes.push(cached.nodes[i]);
        continue;
      }
      const render = PRESENTATION_BLOCK_RENDERERS[envelope.blocks[i].type];
      if (typeof render !== "function") return false;
      const node = render(envelope.blocks[i]);
      if (node === null || node === undefined) return false;
      nodes.push(node);
    }
    host.replaceChildren(...nodes);
    host.dataset.pbSignature = signature;
    presentationBlockCache.set(host, { signature, keys, nodes });
    return true;
  } catch {
    // Contract or renderer failure: fall back to the Markdown renderer.
    return false;
  }
}
