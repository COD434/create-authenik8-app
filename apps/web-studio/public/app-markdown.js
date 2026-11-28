// Markdown rendering and rich-text presentation for assistant messages.
// Loaded after app-ui.js (uses COPY_SVG, notify) and before chat/run scripts.

// Assistant text is rendered with DOM nodes, never HTML strings. Fenced code
// blocks stay monospace and copyable, and every other token is text.
function sanitizeAssistantText(text) {
  if (typeof text !== "string" || text.length === 0) return "";
  // Some models leak raw tool-call traces into content (e.g. DeepSeek XML form).
  // Strip them from visible chat; real tool execution is shown via tool records.
  let cleaned = text.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "");
  cleaned = cleaned.replace(/<tool_call\b[^>]*>[\s\S]*$/gi, ""); // unclosed trailing trace
  // Orphan DeepSeek-style trace tags outside a tool_call block.
  cleaned = cleaned.replace(/<\/?tool_call\b[^>]*>/gi, "");
  cleaned = cleaned.replace(/<function=[^>\n]+>/gi, "");
  cleaned = cleaned.replace(/<\/function>/gi, "");
  cleaned = cleaned.replace(/<parameter=[^>\n]+>/gi, "");
  cleaned = cleaned.replace(/<\/parameter>/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function safeHref(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") return parsed.href;
  } catch (error) { void error; /* ignore invalid URLs */ }
  return null;
}

function inlineNodes(text) {
  const nodes = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*[^*\n]+\*)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      nodes.push(strong);
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      nodes.push(code);
    } else if (token.startsWith("[")) {
      const label = match[2] ?? "";
      const href = safeHref(match[3] ?? "");
      if (href === null) {
        nodes.push(document.createTextNode(token));
      } else {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label;
        nodes.push(a);
      }
    } else {
      const em = document.createElement("em");
      em.textContent = token.slice(1, -1);
      nodes.push(em);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

function highlightCode(codeEl, code, language) {
  const lang = (language || "").toLowerCase();
  const supported = /^(js|javascript|ts|typescript|json|bash|sh|shell|html|css|xml|yaml|yml|sql|py|python|go|rs|rust)$/.test(lang);
  if (!supported) return;
  const tokenDefs = [
    { type: "comment", re: lang.match(/^(html|xml)$/) ? /<!--[\s\S]*?-->/y : lang.match(/^(css)$/) ? /\/\*[\s\S]*?\*\//y : lang.match(/^(bash|sh|shell|yaml|yml|py|python)$/) ? /#.*/y : /\/\/.*|\/\*[\s\S]*?\*\//y },
    { type: "string", re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y },
    { type: "number", re: /\b\d+(?:\.\d+)?\b/y },
    { type: "keyword", re: /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|from|export|default|async|await|type|interface|enum|implements|public|private|protected|readonly|true|false|null|undefined|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|ON|AND|OR|NOT|CREATE|TABLE|def|print|self|import|as|elif|None|True|False)\b/y },
  ];
  const frag = document.createDocumentFragment();
  let i = 0;
  while (i < code.length) {
    let matched = false;
    for (const def of tokenDefs) {
      def.re.lastIndex = i;
      const m = def.re.exec(code);
      if (m && m.index === i) {
        const span = document.createElement("span");
        span.className = `tok-${def.type}`;
        span.textContent = m[0];
        frag.appendChild(span);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      frag.appendChild(document.createTextNode(code[i]));
      i += 1;
    }
  }
  codeEl.textContent = "";
  codeEl.appendChild(frag);
}

function codeBlockNode(code, language, closed = true) {
  const figure = document.createElement("figure");
  figure.className = "code-block";
  const caption = document.createElement("figcaption");
  const label = document.createElement("span");
  label.textContent = language === "" ? "code" : language;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "code-copy";
  copy.title = "Copy code";
  copy.setAttribute("aria-label", "Copy code");
  copy.innerHTML = COPY_SVG; // canon-ignore A8-SEC-08: static trusted SVG constant, never user data
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      notify("Code copied", "ok");
    } catch {
      notify("Clipboard blocked by the browser", "error");
    }
  });
  caption.append(label, copy);
  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.textContent = code;
  if (closed) highlightCode(codeEl, code, language);
  pre.appendChild(codeEl);
  figure.append(caption, pre);
  return figure;
}

function isBlockLine(line) {
  return /^\s*```/.test(line)
    || /^#{1,4}\s+/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line);
}

function readCodeFence(lines, index) {
  const fence = /^\s*```\s*([\w#+.-]*)\s*$/.exec(lines[index]);
  const language = fence[1] ?? "";
  index++;
  const body = [];
  while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
    body.push(lines[index]);
    index++;
  }
  const closed = index < lines.length;
  if (closed) index++;
  return { node: codeBlockNode(body.join("\n"), language, closed), next: index };
}

function readListBlock(lines, index, ordered) {
  const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const list = document.createElement(ordered ? "ol" : "ul");
  while (index < lines.length && pattern.test(lines[index])) {
    const item = document.createElement("li");
    item.append(...inlineNodes(lines[index].replace(pattern, "")));
    list.appendChild(item);
    index++;
  }
  return { node: list, next: index };
}

function splitMarkdownBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") { index++; continue; }

    if (/^\s*```/.test(line)) {
      const start = index;
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) index++;
      if (index < lines.length) index++;
      blocks.push(lines.slice(start, index).join("\n"));
      continue;
    }

    if (/^(#{1,4})\s+/.test(line)) {
      blocks.push(line);
      index++;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const start = index;
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) index++;
      blocks.push(lines.slice(start, index).join("\n"));
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const start = index;
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) index++;
      blocks.push(lines.slice(start, index).join("\n"));
      continue;
    }

    const start = index;
    index++;
    while (index < lines.length && lines[index].trim() !== "" && !isBlockLine(lines[index])) index++;
    blocks.push(lines.slice(start, index).join("\n"));
  }
  return blocks;
}

function renderMarkdownBlock(source) {
  const lines = source.split("\n");
  if (lines.length === 0) return document.createTextNode("");
  const line = lines[0];
  if (/^\s*```/.test(line)) return readCodeFence(lines, 0).node;
  const heading = /^(#{1,4})\s+(.*)$/.exec(line);
  if (heading !== null) {
    const level = heading[1].length;
    const tag = level >= 4 ? "h5" : level >= 3 ? "h4" : "h3";
    const title = document.createElement(tag);
    title.append(...inlineNodes(heading[2]));
    return title;
  }
  if (/^\s*[-*+]\s+/.test(line)) return readListBlock(lines, 0, false).node;
  if (/^\s*\d+[.)]\s+/.test(line)) return readListBlock(lines, 0, true).node;
  const body = document.createElement("p");
  body.append(...inlineNodes(lines.join("\n")));
  return body;
}

const richTextCache = new WeakMap();

function renderRichText(element, text) {
  try {
    const clean = sanitizeAssistantText(text);
    element.dataset.copyText = clean;
    element.classList.add("rich");
    let md = element.querySelector(":scope > .md");
    if (md === null) {
      element.textContent = "";
      md = document.createElement("div");
      md.className = "md";
      element.appendChild(md);
    }
    // Adaptive Presentation Engine first; it declines anything outside the
    // block contract and the Markdown fallback below owns that.
    if (typeof renderPresentationInto === "function" && renderPresentationInto(md, clean)) {
      element.dataset.renderer = "presentation";
      return;
    }
    const previousRenderer = element.dataset.renderer;
    element.dataset.renderer = "markdown";
    const blocks = splitMarkdownBlocks(clean);
    const prev = richTextCache.get(element) ?? [];
    const next = [];
    // A previous presentation render owns the host nodes: rebuild even when
    // the Markdown block keys look unchanged.
    const rendererChanged = previousRenderer !== "markdown";
    let changed = prev.length !== blocks.length || rendererChanged;
    for (let i = 0; i < blocks.length; i++) {
      const source = blocks[i];
      const key = i + "\u0000" + source;
      const cached = prev[i];
      if (cached && cached.key === key) {
        next.push(cached);
        continue;
      }
      changed = true;
      next.push({ key, node: renderMarkdownBlock(source) });
    }
    if (!changed) return;
    richTextCache.set(element, next);
    md.replaceChildren(...next.map((b) => b.node));
    md.dataset.pbSignature = ""; // This host now belongs to the Markdown path.
  } catch {
    // Error boundary per message: never blank the UI on a bad render.
    element.textContent = typeof text === "string" ? text : "";
  }
}

function formatAssistantMessage(element) {
  if (element === null || element.dataset.rich === "true") return;
  renderRichText(element, element.textContent);
  element.dataset.rich = "true";
}

