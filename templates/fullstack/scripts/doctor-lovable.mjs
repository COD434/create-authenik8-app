#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".lovable",
  "coverage",
  "dist",
  "integrations",
  "node_modules",
]);

const RULES = {
  tokenStorage: {
    id: "AUTHK8-LOV-001",
    risk: "Authentication tokens are written to browser storage.",
    remediation: "Use @authenik8/api-client and keep access tokens in memory; refresh tokens stay HttpOnly.",
  },
  supabaseAuth: {
    id: "AUTHK8-LOV-002",
    risk: "Supabase authentication is present beside Authenik8.",
    remediation: "Remove Supabase auth imports/calls. Authenik8 must be the only identity authority.",
  },
  lovableAuth: {
    id: "AUTHK8-LOV-003",
    risk: "Lovable Cloud authentication usage was detected.",
    remediation: "Disable Lovable Cloud auth and connect UI only to the generated Authenik8 client.",
  },
  duplicateAuth: {
    id: "AUTHK8-LOV-004",
    risk: "Frontend code implements an Authenik8 login, refresh, or session request directly.",
    remediation: "Remove the duplicate request implementation and call @authenik8/api-client methods.",
  },
  backendSecret: {
    id: "AUTHK8-LOV-005",
    risk: "A backend-only secret name appears in frontend source.",
    remediation: "Remove it from frontend code and VITE_* values; configure it only on the Authenik8 API host.",
  },
  privateJwk: {
    id: "AUTHK8-LOV-006",
    risk: "Private JWK material may be embedded in frontend source.",
    remediation: "Expose only the public JWKS endpoint; rotate any private key that reached a frontend repository.",
  },
  corsWildcard: {
    id: "AUTHK8-LOV-007",
    risk: "Credentialed CORS is combined with a wildcard origin.",
    remediation: "Allow one exact frontend origin and never use * with credentials.",
  },
  roleTrust: {
    id: "AUTHK8-LOV-008",
    risk: "An administrator role appears to come from editable browser state.",
    remediation: "Use the backend-issued current user for UI hints and rely on API authorization for access.",
  },
  directAdmin: {
    id: "AUTHK8-LOV-009",
    risk: "An admin API is called directly instead of through the generated client.",
    remediation: "Use client.admin methods so Bearer, refresh, CSRF, and credential behavior remains consistent.",
  },
  missingClient: {
    id: "AUTHK8-LOV-010",
    risk: "The frontend does not appear to use the generated Authenik8 client.",
    remediation: "Import createAuthenik8Client or the compatibility exports from @authenik8/api-client.",
  },
  missingApiUrl: {
    id: "AUTHK8-LOV-011",
    risk: "No public Authenik8 API URL configuration example was found.",
    remediation: "Add VITE_AUTHENIK8_API_URL to .env.example; an empty value is allowed for same-origin /api.",
  },
  malformedApiUrl: {
    id: "AUTHK8-LOV-012",
    risk: "VITE_AUTHENIK8_API_URL is malformed or includes an unsafe path.",
    remediation: "Use an HTTP(S) origin, the same origin ending in /api, /api, or an empty same-origin value.",
  },
};

function finding(status, rule, detail = {}) {
  return { status, ...rule, ...detail };
}

async function collectFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (
        SOURCE_EXTENSIONS.has(path.extname(entry.name))
        && !/\.(?:test|spec)\.[^.]+$/.test(entry.name)
      ) {
        files.push(absolute);
      }
    }
  }
  await walk(root);
  return files.sort();
}

function matchingLines(source, expression) {
  const matches = [];
  source.split(/\r?\n/).forEach((line, index) => {
    expression.lastIndex = 0;
    if (expression.test(line)) matches.push({ line: index + 1, text: line.trim().slice(0, 180) });
  });
  return matches;
}

function addPatternFindings(findings, root, file, source, rule, expression) {
  for (const match of matchingLines(source, expression)) {
    findings.push(finding("FAIL", rule, {
      file: path.relative(root, file).split(path.sep).join("/"),
      line: match.line,
    }));
  }
}

function validApiUrl(value) {
  if (value === "" || value === "/api") return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && ["", "/", "/api", "/api/"].includes(url.pathname);
  } catch {
    return false;
  }
}

async function findApiUrl(root) {
  const candidates = [
    ".env",
    ".env.local",
    ".env.development",
    ".env.example",
  ];
  for (const name of candidates) {
    try {
      const source = await fs.readFile(path.join(root, name), "utf8");
      const match = source.match(/^[ \t]*VITE_AUTHENIK8_API_URL[ \t]*=[ \t]*(.*?)[ \t]*$/m);
      if (match) {
        return {
          file: name,
          line: source.slice(0, match.index).split(/\r?\n/).length,
          value: match[1]?.replace(/^['"]|['"]$/g, "") ?? "",
        };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function staticChecks(root) {
  const findings = [];
  const files = await collectFiles(root);
  let combined = "";

  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    combined += `\n${source}`;
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.tokenStorage,
      /(?:localStorage|sessionStorage|indexedDB).*(?:access|refresh|auth|bearer)?token|(?:access|refresh|auth|bearer)?token.*(?:localStorage|sessionStorage|indexedDB)/i,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.supabaseAuth,
      /@supabase\/|supabase\s*\.\s*auth|createClient\s*\([^)]*supabase/i,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.lovableAuth,
      /@lovable\/.*auth|lovable(?:Cloud)?\s*\.\s*auth/i,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.duplicateAuth,
      /(?:fetch|axios(?:\.\w+)?)\s*\([^;\n]*(?:\/auth\/(?:login|refresh)|\/account\/sessions)/i,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.backendSecret,
      /(?:REFRESH_SECRET|DATABASE_URL|REDIS_URL|CLIENT_SECRET|AUTHENIK8_SIGNING_JWKS|PRIVATE_KEY)\s*[:=]/,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.privateJwk,
      /["'](?:d|p|q|dp|dq|qi|oth)["']\s*:/,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.corsWildcard,
      /(?:credentials\s*:\s*true.*origin\s*:\s*["']\*|origin\s*:\s*["']\*.*credentials\s*:\s*true)/i,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.roleTrust,
      /(?:localStorage|sessionStorage).*(?:role|admin)|(?:setRole|isAdmin)\s*\([^)]*(?:searchParams|location|storage)/i,
    );
    addPatternFindings(
      findings,
      root,
      file,
      source,
      RULES.directAdmin,
      /(?:fetch|axios(?:\.\w+)?)\s*\([^;\n]*\/api\/admin\//i,
    );
  }

  if (!/@authenik8\/api-client|createAuthenik8Client/.test(combined)) {
    findings.push(finding("FAIL", RULES.missingClient));
  } else {
    findings.push(finding("PASS", RULES.missingClient, {
      risk: "The generated Authenik8 client is present.",
      remediation: "Keep all authentication and admin calls on this client.",
    }));
  }

  const apiUrl = await findApiUrl(root);
  if (!apiUrl) {
    findings.push(finding("FAIL", RULES.missingApiUrl));
  } else if (!validApiUrl(apiUrl.value)) {
    findings.push(finding("PASS", RULES.missingApiUrl, {
      file: apiUrl.file,
      line: apiUrl.line,
      risk: "Public API URL configuration is present.",
      remediation: "Correct its value before deployment.",
    }));
    findings.push(finding("FAIL", RULES.malformedApiUrl, {
      file: apiUrl.file,
      line: apiUrl.line,
    }));
  } else {
    findings.push(finding("PASS", RULES.missingApiUrl, {
      file: apiUrl.file,
      line: apiUrl.line,
      risk: "Public API URL configuration is present.",
      remediation: "Keep this value public and exact.",
    }));
    findings.push(finding("PASS", RULES.malformedApiUrl, {
      file: apiUrl.file,
      line: apiUrl.line,
      risk: "The configured API URL shape is valid.",
      remediation: "Retest CORS and cookies whenever the origin changes.",
    }));
  }

  const failedRuleIds = new Set(findings.filter((item) => item.status === "FAIL").map((item) => item.id));
  for (const rule of Object.values(RULES)) {
    if (
      !["AUTHK8-LOV-010", "AUTHK8-LOV-011", "AUTHK8-LOV-012"].includes(rule.id)
      && !failedRuleIds.has(rule.id)
    ) {
      findings.push(finding("PASS", rule, {
        risk: `No ${rule.id} violation was found by static inspection.`,
      }));
    }
  }
  return findings;
}

async function runtimeChecks(apiUrl, origin) {
  const findings = [];
  const base = apiUrl.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  async function check(id, description, task) {
    try {
      const passed = await task();
      findings.push({
        status: passed ? "PASS" : "FAIL",
        id,
        risk: description,
        remediation: passed ? "No action required." : "Inspect the API deployment, exact origin, and generated contract.",
      });
    } catch (error) {
      findings.push({
        status: "FAIL",
        id,
        risk: `${description}: ${error instanceof Error ? error.message : String(error)}`,
        remediation: "Confirm the non-production test API is reachable and configured for this frontend origin.",
      });
    }
  }

  await check("AUTHK8-LOV-R01", "API liveness endpoint is reachable", async () => {
    const response = await fetch(`${base}/api/health/live`);
    return response.ok && (await response.json()).status === "ok";
  });
  await check("AUTHK8-LOV-R02", "Current-user rejects an unauthenticated request", async () => {
    const response = await fetch(`${base}/api/auth/me`, { headers: { Origin: origin } });
    return response.status === 401;
  });
  await check("AUTHK8-LOV-R03", "Refresh rejects a request without a valid CSRF/session pair", async () => {
    const response = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Origin: origin },
    });
    return [401, 403].includes(response.status);
  });
  await check("AUTHK8-LOV-R04", "Public JWKS excludes private key fields", async () => {
    const response = await fetch(`${base}/.well-known/jwks.json`);
    const body = await response.json();
    const privateFields = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];
    return response.ok
      && Array.isArray(body.keys)
      && body.keys.every((key) => privateFields.every((field) => !(field in key)));
  });
  await check("AUTHK8-LOV-R05", "CORS echoes the approved frontend origin", async () => {
    const response = await fetch(`${base}/api/health/live`, { headers: { Origin: origin } });
    return response.headers.get("access-control-allow-origin") === origin
      && response.headers.get("access-control-allow-credentials") === "true";
  });
  await check("AUTHK8-LOV-R06", "CORS blocks a lookalike origin", async () => {
    const response = await fetch(`${base}/api/health/live`, {
      headers: { Origin: `${origin}.invalid` },
    });
    return response.status === 403
      || response.headers.get("access-control-allow-origin") !== `${origin}.invalid`;
  });
  return findings;
}

function parseArguments(argv) {
  const options = { json: false, runtime: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") options.json = true;
    else if (value === "--runtime") options.runtime = true;
    else if (value === "--api-url") options.apiUrl = argv[++index];
    else if (value === "--origin") options.origin = argv[++index];
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else if (!options.directory) options.directory = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return options;
}

export async function runLovableDoctor(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const requested = path.resolve(options.directory ?? process.cwd());
  const root = await fs.stat(path.join(requested, "apps/web")).then(
    (stats) => stats.isDirectory() ? path.join(requested, "apps/web") : requested,
    () => requested,
  );
  const findings = await staticChecks(root);
  if (options.runtime) {
    const configured = await findApiUrl(root);
    const apiUrl = options.apiUrl ?? configured?.value;
    const origin = options.origin;
    if (!apiUrl || !origin) {
      throw new Error("--runtime requires --api-url and --origin (or a non-empty VITE_AUTHENIK8_API_URL)");
    }
    findings.push(...await runtimeChecks(apiUrl, origin));
  }

  findings.sort((left, right) =>
    left.id.localeCompare(right.id)
    || (left.file ?? "").localeCompare(right.file ?? "")
    || (left.line ?? 0) - (right.line ?? 0)
  );
  const summary = {
    passed: findings.filter((item) => item.status === "PASS").length,
    warned: findings.filter((item) => item.status === "WARN").length,
    failed: findings.filter((item) => item.status === "FAIL").length,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      tool: "authenik8-lovable-doctor",
      certification: false,
      root,
      summary,
      findings,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`Authenik8 Lovable Doctor\nTarget: ${root}\n\n`);
    for (const item of findings) {
      const location = item.file ? ` ${item.file}${item.line ? `:${item.line}` : ""}` : "";
      process.stdout.write(`${item.status.padEnd(4)} ${item.id}${location} — ${item.risk}\n`);
      if (item.status !== "PASS") process.stdout.write(`     Fix: ${item.remediation}\n`);
    }
    process.stdout.write(`\n${summary.passed} passed, ${summary.warned} warnings, ${summary.failed} failed.\n`);
    process.stdout.write("This is a focused integration check, not a security certification.\n");
  }
  if (summary.failed > 0) process.exitCode = 1;
  return { root, summary, findings };
}

if (
  process.argv[1]
  && (
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
    || path.basename(process.argv[1]) === "doctor-lovable.mjs"
  )
) {
  runLovableDoctor().catch((error) => {
    process.stderr.write(`Authenik8 Lovable Doctor failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
