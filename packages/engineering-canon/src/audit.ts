import { statSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Mechanical checks for the engineering canon. These are high-signal leads,
 * not a substitute for review: every finding points at a rule ID that a human
 * or agent must verify in context.
 *
 * canon-ignore-file: this module contains detector patterns as data. Auditing
 * it with its own regexes would flag the detectors, not application code.
 */

export type CanonSeverity = "critical" | "high" | "medium" | "low";

export type CanonFinding = {
  rule: string;
  severity: CanonSeverity;
  file: string;
  line: number;
  message: string;
  fix: string;
};

export type CanonAuditOptions = {
  /** Include low-severity findings in `ok` (default: false). */
  strict?: boolean;
  /** Cap the number of returned findings (default: 200). */
  maxFindings?: number;
  /** Fingerprints of reviewed, accepted findings that no longer block `ok`. */
  baseline?: ReadonlySet<string>;
};

export type CanonAuditResult = {
  root: string;
  findings: CanonFinding[];
  filesScanned: number;
  filesSkipped: number;
  /** Findings excluded by the baseline; reported so debt stays visible. */
  baselined: number;
  ok: boolean;
};

/**
 * A reviewed record of accepted findings. Matching is by rule, file, and a
 * number-normalized message, so a file that grows from 2,000 to 2,050 lines
 * keeps its baseline entry while a new function or file still fails.
 */
export type CanonBaseline = {
  version: 1;
  findings: Array<Pick<CanonFinding, "rule" | "file" | "message">>;
};

const SKIP_DIRS = new Set([
  ".git",
  ".authenik8",
  ".next",
  ".studio-sandbox",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "vendor",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"]);
const SECRET_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, ...CONFIG_EXTENSIONS, ".env"]);
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FINDINGS = 200;
const MAX_CYCLES = 20;

const SEVERITY_ORDER: Record<CanonSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type WalkedFile = {
  absolute: string;
  relative: string;
  size: number;
};

type ImportEdge = {
  target: string;
  line: number;
};

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: "private key" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key" },
  { pattern: /\bsk-[A-Za-z0-9]{20,}\b/, label: "API secret key" },
  { pattern: /\bghp_[A-Za-z0-9]{20,}\b/, label: "GitHub token" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, label: "Slack token" },
];

type ScanState = "code" | "line" | "block" | "single" | "double" | "template" | "regex";

/**
 * Heuristic from the JavaScript grammar: a slash starts a regex literal when
 * the previous code token expects an expression, not when it follows an
 * operand. This keeps braces and quotes inside regex literals from confusing
 * the scanner.
 */
function startsRegex(codeTail: string): boolean {
  let index = codeTail.length - 1;
  while (index >= 0 && /\s/.test(codeTail[index] ?? "")) index--;
  if (index < 0) return true;
  const char = codeTail[index] ?? "";
  if ("([{=,:;!&|?+-*%^~<>".includes(char)) return true;
  if (char === ")" || char === "]" || char === "}") return false;
  if (/[\w$]/.test(char)) {
    let start = index;
    while (start >= 0 && /[\w$]/.test(codeTail[start] ?? "")) start--;
    const word = codeTail.slice(start + 1, index + 1);
    return /^(?:return|case|typeof|instanceof|in|of|new|delete|void|yield|await|throw|else|do)$/.test(word);
  }
  return false;
}

function scanSource(source: string, keepStringContents: boolean): string {
  let output = "";
  let codeTail = "";
  let index = 0;
  let state: ScanState = "code";
  let inRegexClass = false;

  const appendCode = (char: string): void => {
    output += char;
    codeTail = `${codeTail}${char}`.slice(-32);
  };
  const markOperand = (): void => {
    codeTail = `${codeTail}0`.slice(-32);
  };

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        output += "  ";
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        output += "  ";
        index += 2;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        state = char === "'" ? "single" : char === '"' ? "double" : "template";
        output += keepStringContents ? char : " ";
        index += 1;
        continue;
      }
      if (char === "/" && startsRegex(codeTail)) {
        state = "regex";
        inRegexClass = false;
        output += " ";
        index += 1;
        continue;
      }
      appendCode(char);
      index += 1;
      continue;
    }

    if (state === "line") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
      index += 1;
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        output += "  ";
        index += 2;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    if (state === "regex") {
      if (char === "\\") {
        output += "  ";
        index += 2;
        continue;
      }
      if (char === "[") inRegexClass = true;
      else if (char === "]") inRegexClass = false;
      else if (char === "/" && !inRegexClass) {
        state = "code";
        markOperand();
        output += " ";
        index += 1;
        continue;
      } else if (char === "\n") {
        state = "code";
        output += "\n";
        index += 1;
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    const closing = state === "single" ? "'" : state === "double" ? '"' : "`";
    if (char === "\\") {
      output += keepStringContents ? `${char}${next}` : "  ";
      index += 2;
      continue;
    }
    if (char === closing) {
      state = "code";
      markOperand();
      output += keepStringContents ? char : " ";
      index += 1;
      continue;
    }
    output += char === "\n" ? "\n" : keepStringContents ? char : " ";
    index += 1;
  }

  return output;
}

/** Remove comments and the contents of strings, preserving line numbers. */
export function stripCommentsAndStrings(source: string): string {
  return scanSource(source, false);
}

/** Remove comments but keep string contents, for import and secret scanning. */
export function stripComments(source: string): string {
  return scanSource(source, true);
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let index = 0; index < end; index++) {
    if (source.charCodeAt(index) === 10) line++;
  }
  return line;
}

function addFinding(
  findings: CanonFinding[],
  finding: Omit<CanonFinding, "file" | "line"> & { file: string; line: number },
): void {
  findings.push(finding);
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

type FunctionSpan = {
  name: string;
  start: number;
  end: number;
};

function findFunctionSpans(stripped: string): FunctionSpan[] {
  const spans: FunctionSpan[] = [];
  const seen = new Set<number>();
  const patterns: Array<RegExp> = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g,
    /^[ \t]*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^={]+)?\s*\{/gm,
  ];
  const reserved = new Set([
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "function",
    "do",
    "else",
    "try",
    "with",
    "return",
  ]);

  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) {
      const name = match[1] ?? "anonymous";
      if (reserved.has(name)) continue;
      const bodyStart = (match.index ?? 0) + match[0].lastIndexOf("{");
      if (seen.has(bodyStart)) continue;
      const bodyEnd = findMatchingBrace(stripped, bodyStart);
      if (bodyEnd === -1) continue;
      seen.add(bodyStart);
      spans.push({ name, start: bodyStart, end: bodyEnd });
    }
  }

  return spans;
}

/**
 * A literal, an all-caps constant, or a clearing assignment cannot carry
 * untrusted data. Everything else is a lead that a reviewer must verify.
 */
function isStaticHtmlSink(line: string): boolean {
  if (!/\.innerHTML\s*=/.test(line)) return false;
  const code = line.replace(/\/\/.*$/, "").trim();
  const assignment = code.indexOf("=");
  if (assignment === -1) return false;
  const value = code.slice(assignment + 1).trim().replace(/;$/, "").trim();
  if (value === "" || value === '""' || value === "''" || value === "``") return true;
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return true;
  if (/^'(?:[^'\\]|\\.)*'$/.test(value)) return true;
  if (/^`[^`$]*`$/.test(value)) return true;
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function isTestPath(relative: string): boolean {
  return /(^|[\\/])(?:tests?|__tests__|spec)([\\/]|$)/i.test(relative) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(relative);
}

function isMinified(relative: string): boolean {
  return /\.min\.(?:js|css)$/i.test(relative);
}

function shouldScanSecrets(relative: string): boolean {
  const base = path.basename(relative).toLowerCase();
  if (base === ".env.example" || base === "package-lock.json" || base.endsWith(".lock")) return false;
  if (base.endsWith(".map") || isMinified(relative)) return false;
  return SECRET_EXTENSIONS.has(path.extname(relative).toLowerCase()) || base.startsWith(".env");
}

async function walk(root: string): Promise<{ files: WalkedFile[]; skipped: number }> {
  const files: WalkedFile[] = [];
  let skipped = 0;
  const stack: string[] = [root];

  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === undefined) break;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      skipped++;
      continue;
    }

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase())) {
          skipped++;
          continue;
        }
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (isMinified(relative)) {
        skipped++;
        continue;
      }
      let size = 0;
      try {
        size = (await stat(absolute)).size;
      } catch {
        skipped++;
        continue;
      }
      if (size > MAX_FILE_BYTES) {
        skipped++;
        continue;
      }
      files.push({ absolute, relative, size });
    }
  }

  return { files, skipped };
}

function resolveImport(root: string, fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base];
  if (base.endsWith(".js")) {
    candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  }
  if (base.endsWith(".mjs")) candidates.push(`${base.slice(0, -4)}.mts`);
  if (base.endsWith(".cjs")) candidates.push(`${base.slice(0, -4)}.cts`);
  for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of SOURCE_EXTENSIONS) {
    candidates.push(path.join(base, `index${extension}`));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const relative = path.relative(root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    try {
      if (statSync(resolved).isFile()) return resolved;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function findCycles(graph: Map<string, ImportEdge[]>): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const visit = (node: string): void => {
    if (onStack.has(node)) {
      const start = stack.indexOf(node);
      if (start !== -1) {
        const cycle = [...stack.slice(start), node];
        const key = [...new Set(cycle)].sort().join("|");
        if (!seen.has(key) && cycles.length < MAX_CYCLES) {
          seen.add(key);
          cycles.push(cycle);
        }
      }
      return;
    }
    if (done.has(node)) return;
    onStack.add(node);
    stack.push(node);
    for (const edge of graph.get(node) ?? []) visit(edge.target);
    stack.pop();
    onStack.delete(node);
    done.add(node);
  };

  for (const node of graph.keys()) visit(node);
  return cycles;
}

function importLine(graph: Map<string, ImportEdge[]>, from: string, to: string): number {
  return (graph.get(from) ?? []).find((edge) => edge.target === to)?.line ?? 1;
}

function relativePath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function analyzeSource(
  root: string,
  file: WalkedFile,
  source: string,
  findings: CanonFinding[],
  imports: Map<string, ImportEdge[]>,
): void {
  if (source.slice(0, 512).includes("canon-ignore-file")) return;
  const stripped = stripCommentsAndStrings(source);
  const lines = source.split(/\r?\n/);
  const strippedLines = stripped.split(/\r?\n/);
  const commentFree = stripComments(source);
  const commentFreeLines = commentFree.split(/\r?\n/);
  const lineCount = lines.length;

  if (lineCount > 1200) {
    addFinding(findings, {
      rule: "A8-READ-01",
      severity: "high",
      file: file.relative,
      line: 1,
      message: `file is ${lineCount} lines; this is past the point where a reader can hold it in view`,
      fix: "Split by responsibility, not by layer, and keep the public surface in one small entry module.",
    });
  } else if (lineCount > 800) {
    addFinding(findings, {
      rule: "A8-READ-01",
      severity: "medium",
      file: file.relative,
      line: 1,
      message: `file is ${lineCount} lines`,
      fix: "Look for a second responsibility or a hidden submodule and extract it behind a smaller interface.",
    });
  }

  for (const span of findFunctionSpans(stripped)) {
    const startLine = lineAt(stripped, span.start);
    const endLine = lineAt(stripped, span.end);
    const length = endLine - startLine + 1;
    if (length > 100) {
      addFinding(findings, {
        rule: "A8-READ-01",
        severity: "high",
        file: file.relative,
        line: startLine,
        message: `${span.name} is about ${length} lines`,
        fix: "Extract named steps or a deeper helper module; the function should read as one level of abstraction.",
      });
    } else if (length > 60) {
      addFinding(findings, {
        rule: "A8-READ-01",
        severity: "medium",
        file: file.relative,
        line: startLine,
        message: `${span.name} is about ${length} lines`,
        fix: "Extract the distinct steps into named helpers and keep this function to one job.",
      });
    }
  }

  const anyPattern = /(?::\s*any\b|<any>|\bas\s+any\b|\bany\[\])/g;
  for (const match of stripped.matchAll(anyPattern)) {
    addFinding(findings, {
      rule: "A8-TS-01",
      severity: "high",
      file: file.relative,
      line: lineAt(stripped, match.index ?? 0),
      message: "explicit any escapes the type system",
      fix: "Use unknown plus a narrowing parser at the boundary, or define the real union or interface.",
    });
  }

  for (const [index, line] of lines.entries()) {
    if (/@ts-ignore|@ts-nocheck/.test(line)) {
      addFinding(findings, {
        rule: "A8-TS-10",
        severity: "high",
        file: file.relative,
        line: index + 1,
        message: "type checking is suppressed",
        fix: "Fix the type error. If suppression is truly unavoidable, use @ts-expect-error with a reason and a linked issue.",
      });
    }
    const strippedLine = strippedLines[index] ?? "";
    if (/\bas\s+unknown\s+as\b/.test(strippedLine)) {
      addFinding(findings, {
        rule: "A8-TS-06",
        severity: "medium",
        file: file.relative,
        line: index + 1,
        message: "double cast bypasses the type system",
        fix: "Validate the value with a schema or write a type guard at the boundary.",
      });
    }
    if (/@ts-expect-error\s*$/.test(line)) {
      addFinding(findings, {
        rule: "A8-TS-10",
        severity: "low",
        file: file.relative,
        line: index + 1,
        message: "@ts-expect-error has no stated reason",
        fix: "Add a short reason after the directive so the next reader can judge when it can be removed.",
      });
    }
  }

  const catchPattern = /catch\s*(?:\([^)]*\))?\s*\{/g;
  for (const match of stripped.matchAll(catchPattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf("{");
    const close = findMatchingBrace(stripped, open);
    if (close === -1) continue;
    const body = stripped.slice(open + 1, close).replace(/\s+/g, "");
    if (body === "") {
      const documented = /\/\/|\/\*/.test(source.slice(open + 1, close));
      addFinding(findings, {
        rule: "A8-REL-05",
        severity: documented ? "low" : "high",
        file: file.relative,
        line: lineAt(stripped, match.index ?? 0),
        message: documented
          ? "empty catch is documented but still swallows the failure; verify the failure is non-critical"
          : "empty catch swallows the failure",
        fix: documented
          ? "Confirm the stated reason is true and the caller can proceed. Otherwise rethrow or return a typed failure."
          : "Handle, rethrow with context, or convert the failure into an explicit result. Never continue silently.",
      });
    } else if (/^console\.(?:log|error|warn)\([^)]*\);?$/.test(body)) {
      addFinding(findings, {
        rule: "A8-REL-05",
        severity: "medium",
        file: file.relative,
        line: lineAt(stripped, match.index ?? 0),
        message: "catch only logs and then continues",
        fix: "Decide whether the caller can proceed. Rethrow or return a typed failure instead of hiding it in a log.",
      });
    }
  }

  const storagePattern = /\b(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem)\s*\(\s*["'][^"']*(?:token|jwt|secret|session|auth)[^"']*["']/i;
  for (const [index, line] of commentFreeLines.entries()) {
    if (storagePattern.test(line)) {
      addFinding(findings, {
        rule: "A8-SEC-04",
        severity: "critical",
        file: file.relative,
        line: index + 1,
        message: "credential or session material is read from or written to browser storage",
        fix: "Keep the credential in an HttpOnly, Secure, SameSite cookie and enforce authorization on the server.",
      });
    }
  }

  const sinkPatterns: Array<{ pattern: RegExp; rule: string; message: string; fix: string }> = [
    {
      pattern: /dangerouslySetInnerHTML|\[innerHTML\]|\bv-html\b/,
      rule: "A8-SEC-08",
      message: "raw HTML injection sink",
      fix: "Render text through the framework's escaping path. If HTML is required, sanitize it with a maintained allowlist sanitizer.",
    },
    {
      pattern: /\.innerHTML\s*=|document\.write\s*\(/,
      rule: "A8-SEC-08",
      message: "DOM HTML sink",
      fix: "Use textContent or DOM construction, or sanitize with a maintained allowlist sanitizer.",
    },
    {
      pattern: /\beval\s*\(|new\s+Function\s*\(/,
      rule: "A8-SEC-09",
      message: "dynamic code execution",
      fix: "Remove the eval path. Parse data with a schema and dispatch through an explicit allowlist.",
    },
  ];
  for (const [index, line] of strippedLines.entries()) {
    const originalLine = lines[index] ?? "";
    const commentFreeLine = commentFreeLines[index] ?? "";
    for (const sink of sinkPatterns) {
      if (!sink.pattern.test(line)) continue;
      if (sink.rule === "A8-SEC-08" && isStaticHtmlSink(originalLine)) continue;
      const documentedStatic =
        sink.rule === "A8-SEC-08" &&
        /\.innerHTML\s*=/.test(line) &&
        /never user data|static (?:brand|local|svg)/i.test(originalLine);
      addFinding(findings, {
        rule: sink.rule,
        severity: documentedStatic ? "low" : "high",
        file: file.relative,
        line: index + 1,
        message: documentedStatic
          ? "raw HTML sink is documented as static; verify the value cannot carry user data"
          : sink.message,
        fix: sink.fix,
      });
    }
    if (/Access-Control-Allow-Origin["']?\s*[,:=]\s*["']?\*["']?/.test(commentFreeLine)) {
      addFinding(findings, {
        rule: "A8-SEC-02",
        severity: "high",
        file: file.relative,
        line: index + 1,
        message: "wildcard CORS policy exposes the API to any origin",
        fix: "Allowlist trusted origins and keep credentials out of wildcard responses.",
      });
    }
    if (/\balgorithms\s*:\s*\[\s*["']none["']/i.test(commentFreeLine)) {
      addFinding(findings, {
        rule: "A8-SEC-06",
        severity: "critical",
        file: file.relative,
        line: index + 1,
        message: "JWT verification allows the none algorithm",
        fix: "Pass an explicit allowlist of asymmetric or HMAC algorithms and reject everything else.",
      });
    }
    if (/\b(?:password|passwd|pwd)\b/i.test(commentFreeLine) && /createHash\s*\(\s*["'](?:md5|sha1|sha256)["']/i.test(commentFreeLine)) {
      addFinding(findings, {
        rule: "A8-SEC-05",
        severity: "high",
        file: file.relative,
        line: index + 1,
        message: "password hashing uses a fast general-purpose digest",
        fix: "Use Argon2id, scrypt, or bcrypt with a per-user salt and a calibrated work factor.",
      });
    }
    if (/\b(?:token|secret|session|otp|nonce|password)\b/i.test(line) && /Math\.random\s*\(/.test(line)) {
      addFinding(findings, {
        rule: "A8-SEC-05",
        severity: "high",
        file: file.relative,
        line: index + 1,
        message: "security-sensitive value uses Math.random",
        fix: "Use crypto.randomBytes or crypto.randomUUID from a cryptographically secure source.",
      });
    }
  }

  const sqlInterpolation = /\b(?:query|execute|raw|exec)\s*\(\s*`[^`]*\$\{/gs;
  for (const match of commentFree.matchAll(sqlInterpolation)) {
    addFinding(findings, {
      rule: "A8-DATA-07",
      severity: "high",
      file: file.relative,
      line: lineAt(commentFree, match.index ?? 0),
      message: "SQL is built with template interpolation",
      fix: "Use bound parameters or the query builder's parameter API. Never splice values into SQL text.",
    });
  }
  const sqlConcatenation = /\b(?:query|execute|raw|exec)\s*\(\s*["'][^"']*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*\+/gis;
  for (const match of commentFree.matchAll(sqlConcatenation)) {
    addFinding(findings, {
      rule: "A8-DATA-07",
      severity: "high",
      file: file.relative,
      line: lineAt(commentFree, match.index ?? 0),
      message: "SQL is built by string concatenation",
      fix: "Use bound parameters. Concatenation turns user input into SQL syntax.",
    });
  }

  if (!isTestPath(file.relative)) {
    for (const match of commentFree.matchAll(/\bSELECT\s+\*\s+FROM\b/gi)) {
      addFinding(findings, {
        rule: "A8-DATA-04",
        severity: "low",
        file: file.relative,
        line: lineAt(commentFree, match.index ?? 0),
        message: "SELECT * couples the code to every current and future column",
        fix: "Select the columns the caller needs so schema changes do not silently change the result shape.",
      });
    }
  }

  const importPattern = /(?:^|[^\w$])(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\)/g;
  const edges: ImportEdge[] = [];
  for (const match of commentFree.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? "";
    const target = resolveImport(root, file.absolute, specifier);
    if (target === null) continue;
    edges.push({ target, line: lineAt(commentFree, match.index ?? 0) });
  }
  imports.set(file.absolute, edges);
}

function scanSecrets(file: WalkedFile, source: string, findings: CanonFinding[]): void {
  if (source.slice(0, 512).includes("canon-ignore-file")) return;
  if (!shouldScanSecrets(file.relative)) return;
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
      continue;
    }
    if (/\b(?:example|placeholder|redacted|your[-_]|xxxx|process\.env|import\.meta\.env)\b/i.test(line)) {
      continue;
    }
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(line)) {
        addFinding(findings, {
          rule: "A8-SEC-04",
          severity: "critical",
          file: file.relative,
          line: index + 1,
          message: `hard-coded ${secret.label}`,
          fix: "Revoke the value, move it to a server-side secret store, and load it from the environment at runtime.",
        });
      }
    }
  }
}

/**
 * A line-level `canon-ignore <rule>` is a deliberate, reviewable assertion that
 * the finding is a false positive. The comment must sit on the finding's line so
 * the exception is visible next to the code it excuses.
 */
function removeSuppressed(file: WalkedFile, source: string, findings: CanonFinding[]): void {
  const lines = source.split(/\r?\n/);
  for (let index = findings.length - 1; index >= 0; index--) {
    const finding = findings[index];
    if (finding === undefined || finding.file !== file.relative) continue;
    const line = lines[finding.line - 1] ?? "";
    if (new RegExp(`canon-ignore(?:\\s+${finding.rule})?\\b`).test(line)) {
      findings.splice(index, 1);
    }
  }
}

function dedupe(findings: CanonFinding[]): CanonFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.rule}|${finding.file}|${finding.line}|${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function auditProject(
  root: string,
  options: CanonAuditOptions = {},
): Promise<CanonAuditResult> {
  const absoluteRoot = path.resolve(root);
  const { files, skipped } = await walk(absoluteRoot);
  const findings: CanonFinding[] = [];
  const imports = new Map<string, ImportEdge[]>();
  let filesScanned = 0;

  for (const file of files) {
    const extension = path.extname(file.relative).toLowerCase();
    const base = path.basename(file.relative).toLowerCase();
    const isSource = SOURCE_EXTENSIONS.has(extension);
    const isText = isSource || CONFIG_EXTENSIONS.has(extension) || base.startsWith(".env") || base === "Dockerfile";
    if (!isText) continue;

    let source: string;
    try {
      source = await readFile(file.absolute, "utf8");
    } catch {
      continue;
    }
    if (source.includes("\u0000")) continue;
    filesScanned++;

    scanSecrets(file, source, findings);
    if (isSource) analyzeSource(absoluteRoot, file, source, findings, imports);
    removeSuppressed(file, source, findings);
  }

  const cycles = findCycles(imports);
  for (const cycle of cycles) {
    const first = cycle[0];
    const second = cycle[1];
    if (first === undefined || second === undefined) continue;
    const display = cycle.map((node) => relativePath(absoluteRoot, node)).join(" -> ");
    addFinding(findings, {
      rule: "A8-ARCH-12",
      severity: "high",
      file: relativePath(absoluteRoot, first),
      line: importLine(imports, first, second),
      message: `import cycle: ${display}`,
      fix: "Move the shared abstraction into a third module, invert one dependency, or merge the two modules if they are one responsibility.",
    });
  }

  const unique = dedupe(findings).sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severity !== 0) return severity;
    const file = left.file.localeCompare(right.file);
    if (file !== 0) return file;
    return left.line - right.line;
  });
  const baseline = options.baseline ?? new Set<string>();
  const actionable = unique.filter((finding) => !baseline.has(canonFingerprint(finding)));
  const capped = actionable.slice(0, options.maxFindings ?? MAX_FINDINGS);
  const blocking = capped.some(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  );
  const ok = options.strict === true ? capped.length === 0 : !blocking;

  return {
    root: absoluteRoot,
    findings: capped,
    filesScanned,
    filesSkipped: skipped,
    baselined: unique.length - actionable.length,
    ok,
  };
}

/**
 * Stable identity for a baseline entry. Line numbers are deliberately absent:
 * unrelated edits shift lines, but they do not make accepted debt new.
 */
export function canonFingerprint(
  finding: Pick<CanonFinding, "rule" | "file" | "message">,
): string {
  return `${finding.rule}\u0000${finding.file}\u0000${finding.message.replace(/\d+/g, "#")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validate a parsed baseline document before trusting it as a gate. */
export function parseCanonBaseline(value: unknown): CanonBaseline {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.findings)) {
    throw new Error("baseline must be an object with version 1 and a findings array");
  }
  const findings = value.findings.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.rule !== "string" ||
      typeof entry.file !== "string" ||
      typeof entry.message !== "string"
    ) {
      throw new Error(`baseline findings[${index}] must have string rule, file, and message`);
    }
    return { rule: entry.rule, file: entry.file, message: entry.message };
  });
  return { version: 1, findings };
}

/** Build the reviewed-debt document from a full, unfiltered audit. */
export function createCanonBaseline(findings: readonly CanonFinding[]): CanonBaseline {
  return {
    version: 1,
    findings: findings.map(({ rule, file, message }) => ({ rule, file, message })),
  };
}

export function formatCanonFindings(result: CanonAuditResult): string {
  const counts: Record<CanonSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of result.findings) counts[finding.severity]++;

  if (result.findings.length === 0) {
    const debt = result.baselined > 0 ? `, ${result.baselined} baselined` : "";
    return `canon audit: clean (${result.filesScanned} files scanned, ${result.filesSkipped} skipped${debt})`;
  }

  const summary = [
    `canon audit: ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}`,
    `(${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low)`,
    `in ${result.filesScanned} files`,
    result.baselined > 0 ? `· ${result.baselined} baselined` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [summary, ""];
  for (const finding of result.findings) {
    lines.push(
      `[${finding.severity}] ${finding.rule} ${finding.file}:${finding.line} ${finding.message}`,
    );
    lines.push(`  fix: ${finding.fix}`);
  }
  return lines.join("\n");
}

/** Exposed for tests and for skills that need the raw rule metadata. */
export const AUDIT_RULES: ReadonlyArray<{ rule: string; severity: CanonSeverity; summary: string }> = [
  { rule: "A8-ARCH-12", severity: "high", summary: "relative import cycles" },
  { rule: "A8-READ-01", severity: "high", summary: "oversized files and functions" },
  { rule: "A8-TS-01", severity: "high", summary: "explicit any" },
  { rule: "A8-TS-06", severity: "medium", summary: "double casts" },
  { rule: "A8-TS-10", severity: "high", summary: "type-check suppression" },
  { rule: "A8-REL-05", severity: "high", summary: "swallowed errors" },
  { rule: "A8-SEC-02", severity: "high", summary: "wildcard CORS" },
  { rule: "A8-SEC-04", severity: "critical", summary: "hard-coded secrets and browser token storage" },
  { rule: "A8-SEC-05", severity: "high", summary: "weak password hashing and Math.random secrets" },
  { rule: "A8-SEC-06", severity: "critical", summary: "JWT none algorithm" },
  { rule: "A8-SEC-08", severity: "high", summary: "raw HTML sinks" },
  { rule: "A8-SEC-09", severity: "high", summary: "dynamic code execution" },
  { rule: "A8-DATA-04", severity: "low", summary: "SELECT star" },
  { rule: "A8-DATA-07", severity: "high", summary: "SQL interpolation or concatenation" },
];
