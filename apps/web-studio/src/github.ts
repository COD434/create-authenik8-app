import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { IntegrationError, type FetchLike } from "./integrations.js";
import { parseProjectZip, ProjectImportError } from "./import.js";

const API = "https://api.github.com";
const MAX_FILES = 2_000;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_DEPTH = 16;
const WORKFLOW_PATH = ".github/workflows/authenik8-ci.yml";
const WORKFLOW = `name: Authenik8 CI
on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0
        with:
          node-version: 22
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        if: hashFiles('bun.lock', 'bun.lockb') != ''
      - name: Install and check the project
        shell: bash
        run: |
          if [ ! -f package.json ]; then
            echo "No package.json found; skipping Node checks."
            exit 0
          fi
          if [ -f pnpm-lock.yaml ]; then
            corepack enable
            pnpm install --frozen-lockfile
          elif [ -f yarn.lock ]; then
            corepack enable
            yarn install --frozen-lockfile
          elif [ -f bun.lock ] || [ -f bun.lockb ]; then
            bun install --frozen-lockfile
          elif [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi
          npm run build --if-present
          npm run test --if-present
`;

type GithubFile = { path: string; data: Buffer };
type SensitiveContentFinding = { path: string; patterns: string[] };
const SENSITIVE_CONTENT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/ },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "AWS secret access key", pattern: /(?:aws_secret_access_key|secretAccessKey)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}\b/i },
  { name: "live Stripe key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "database URL with password", pattern: /\bpostgres(?:ql)?:\/\/[^\s/:@]+:[^\s/@]+@/i },
];

function detectSensitiveContent(data: Buffer): string[] {
  if (data.includes(0)) return [];
  const text = data.toString("utf8");
  return SENSITIVE_CONTENT_PATTERNS.flatMap(({ name, pattern }) => pattern.test(text) ? [name] : []);
}
type GithubRequestOptions = {
  token: string;
  fetch: FetchLike;
  method?: string;
  body?: unknown;
};

type GithubManifest = {
  repository: string;
  branch: string;
  paths: string[];
};

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "Authenik8-Studio",
    "x-github-api-version": "2022-11-28",
  };
}

function integrationFailure(status: number, body: Record<string, unknown> | null, token: string): IntegrationError {
  const message = typeof body?.message === "string" ? body.message.replaceAll(token, "[redacted]") : "";
  if (status === 401) return new IntegrationError(401, "GitHub rejected this token. Check that it is active and has not expired.", "github_auth");
  if (status === 403) return new IntegrationError(403, "GitHub denied this request. Check repository access and token permissions: Actions read for CI logs, or Contents write to publish changes.", "github_permission");
  if (status === 404) return new IntegrationError(404, "GitHub could not find this repository or branch with the supplied token. Check the repository name and token access.", "github_not_found");
  if (status === 409) return new IntegrationError(409, "The repository changed while Studio was publishing. Refresh and try again.", "github_conflict");
  const safeMessage = message.length > 0 ? ` ${message.slice(0, 240)}` : "";
  return new IntegrationError(status >= 400 && status < 600 ? status : 502, `GitHub returned HTTP ${status}.${safeMessage}`, "github_provider");
}

async function githubRequest(
  route: string,
  options: GithubRequestOptions,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await options.fetch(`${API}${route}`, {
      method: options.method ?? "GET",
      headers: githubHeaders(options.token),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new IntegrationError(502, "Could not reach GitHub. Check the connection and try again.", "github_network");
  }
  const data: unknown = await response.json().catch(() => null);
  const body = typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
  if (!response.ok) throw integrationFailure(response.status, body, options.token);
  return body ?? {};
}

function parseRepository(value: string): { owner: string; name: string; fullName: string } {
  const match = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.exec(value.trim());
  if (match === null) {
    throw new IntegrationError(400, "Enter the repository as owner/name, for example octo-org/team-portal.", "github_repository");
  }
  return { owner: match[1]!, name: match[2]!, fullName: `${match[1]!}/${match[2]!}` };
}

function apiRepoPath(owner: string, name: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function apiBranchPath(branch: string): string {
  return branch.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function isSecretLike(relativePath: string): boolean {
  const name = path.posix.basename(relativePath).toLowerCase();
  return name === ".git"
    || name === ".authenik8"
    || /^\.env(?:$|\.)/.test(name)
    || name === ".npmrc"
    || name === ".netrc"
    || /^id_(?:rsa|ed25519)$/.test(name)
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(name)
    || /^(?:credentials|service-account)(?:\.[^.]+)?\.json$/i.test(name);
}

const SKIPPED_DIRS = new Set([
  ".git", ".authenik8", ".ssh", ".aws", ".azure", ".gnupg", ".kube", ".docker",
  ".next", ".nuxt", ".vercel", ".netlify",
  "node_modules", "coverage", "vendor",
]);

async function collectGithubFiles(sandboxRoot: string): Promise<{ files: GithubFile[]; skippedSecretLike: number; sensitiveContent: SensitiveContentFinding[] }> {
  const files: GithubFile[] = [];
  const sensitiveContent: SensitiveContentFinding[] = [];
  let totalBytes = 0;
  let skippedSecretLike = 0;
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) throw new IntegrationError(413, `Project folders are nested too deeply (limit ${MAX_DEPTH}).`, "github_project_limit");
    let dirents;
    try {
      dirents = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (depth === 0 && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of dirents) {
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(sandboxRoot, fullPath).split(path.sep).join("/");
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name.toLowerCase())) continue;
        await walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSecretLike(relative)) {
        skippedSecretLike += 1;
        continue;
      }
      const data = await readFile(fullPath);
      const patterns = detectSensitiveContent(data);
      if (patterns.length > 0) sensitiveContent.push({ path: relative, patterns });
      totalBytes += data.length;
      if (totalBytes > MAX_BYTES) {
        throw new IntegrationError(413, `Included project files exceed the 15 MB GitHub sync limit.`, "github_project_limit");
      }
      files.push({ path: relative, data });
      if (files.length > MAX_FILES) {
        throw new IntegrationError(413, `The project has more than ${MAX_FILES} files.`, "github_project_limit");
      }
    }
  }
  await walk(sandboxRoot, 0);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, skippedSecretLike, sensitiveContent };
}

function manifestPath(sandboxRoot: string): string {
  return path.join(sandboxRoot, ".authenik8", "github-sync.json");
}

async function readManifest(sandboxRoot: string): Promise<GithubManifest | null> {
  try {
    const value: unknown = JSON.parse(await readFile(manifestPath(sandboxRoot), "utf8"));
    if (typeof value !== "object" || value === null) return null;
    const manifest = value as Partial<GithubManifest>;
    return typeof manifest.repository === "string"
      && typeof manifest.branch === "string"
      && Array.isArray(manifest.paths)
      && manifest.paths.every((item) => typeof item === "string")
      ? manifest as GithubManifest
      : null;
  } catch {
    return null;
  }
}

export async function inspectGithubProject(sandboxRoot: string): Promise<{
  files: string[];
  skippedSecretLike: number;
  sensitiveContent: SensitiveContentFinding[];
  workflowPresent: boolean;
  repository: string | null;
  branch: string | null;
}> {
  const project = await collectGithubFiles(sandboxRoot);
  const files = project.files;
  const manifest = await readManifest(sandboxRoot);
  const workflowPresent = files.some((file) => file.path === WORKFLOW_PATH);
  return {
    files: files.map((file) => file.path),
    skippedSecretLike: project.skippedSecretLike,
    sensitiveContent: project.sensitiveContent,
    workflowPresent,
    repository: manifest?.repository ?? null,
    branch: manifest?.branch ?? null,
  };
}

export async function verifyGithubAccess(options: {
  token: string;
  repository: string;
  fetch: FetchLike;
}): Promise<{ repository: string; defaultBranch: string; private: boolean; canPush: boolean | null }> {
  const { owner, name, fullName } = parseRepository(options.repository);
  const apiOptions = { token: options.token, fetch: options.fetch };
  const repo = await githubRequest(apiRepoPath(owner, name), apiOptions);
  const permissions = typeof repo.permissions === "object" && repo.permissions !== null
    ? repo.permissions as Record<string, unknown>
    : null;
  if (repo.permissions !== undefined
    && permissions?.push === false) {
    throw new IntegrationError(403, "This token can read the repository but does not have permission to push changes.", "github_read_only");
  }
  return {
    repository: typeof repo.full_name === "string" ? repo.full_name : fullName,
    defaultBranch: typeof repo.default_branch === "string" ? repo.default_branch : "main",
    private: repo.private === true,
    canPush: typeof permissions?.push === "boolean" ? permissions.push : null,
  };
}

export type GithubWorkflowRun = {
  id: number;
  name: string;
  title: string;
  branch: string;
  status: string;
  conclusion: string | null;
  event: string;
  createdAt: string;
  url: string;
};

export async function listGithubWorkflowRuns(options: {
  token: string;
  repository: string;
  fetch: FetchLike;
}): Promise<{ repository: string; runs: GithubWorkflowRun[] }> {
  const { owner, name, fullName } = parseRepository(options.repository);
  const result = await githubRequest(`${apiRepoPath(owner, name)}/actions/runs?per_page=20`, {
    token: options.token,
    fetch: options.fetch,
  });
  const runs = Array.isArray(result.workflow_runs) ? result.workflow_runs.flatMap((value): GithubWorkflowRun[] => {
    if (typeof value !== "object" || value === null) return [];
    const run = value as Record<string, unknown>;
    if (typeof run.id !== "number" || !Number.isSafeInteger(run.id)) return [];
    return [{
      id: run.id,
      name: typeof run.name === "string" ? run.name : "GitHub Actions",
      title: typeof run.display_title === "string" ? run.display_title : "Workflow run",
      branch: typeof run.head_branch === "string" ? run.head_branch : "unknown",
      status: typeof run.status === "string" ? run.status : "unknown",
      conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
      event: typeof run.event === "string" ? run.event : "unknown",
      createdAt: typeof run.created_at === "string" ? run.created_at : "",
      url: typeof run.html_url === "string" ? run.html_url : `https://github.com/${fullName}/actions`,
    }];
  }) : [];
  return { repository: typeof result.repository === "string" ? result.repository : fullName, runs };
}

type CiFinding = { title: string; explanation: string; nextStep: string };

function diagnoseLog(log: string): CiFinding {
  const signatures: Array<{ pattern: RegExp; finding: CiFinding }> = [
    { pattern: /npm ci can only install packages|package\.json and .*lock|lock file.*out of sync/i, finding: {
      title: "Dependency lockfile is out of sync",
      explanation: "The package manifest and lockfile disagree, so the clean CI install stopped before the checks ran.",
      nextStep: "Regenerate the lockfile with the project's package manager and commit it with package.json.",
    } },
    { pattern: /Missing script: ["']?(build|test|lint|typecheck)|missing script/i, finding: {
      title: "A requested package script is missing",
      explanation: "The workflow called a script that package.json does not define.",
      nextStep: "Add the missing script or adjust the workflow to call a script this project provides.",
    } },
    { pattern: /ERESOLVE|unable to resolve dependency tree/i, finding: {
      title: "Package dependency conflict",
      explanation: "The package manager could not find compatible versions for the declared dependencies.",
      nextStep: "Review the conflicting package versions in the log and update the dependency ranges or lockfile.",
    } },
    { pattern: /error TS\d{4}|TS\d{4}:/i, finding: {
      title: "TypeScript compilation failed",
      explanation: "The build reached TypeScript and reported one or more type or compiler errors.",
      nextStep: "Fix the first TypeScript error in the log, then rerun the build locally.",
    } },
    { pattern: /ERR_MODULE_NOT_FOUND|Cannot find module|Module not found/i, finding: {
      title: "A module or file could not be resolved",
      explanation: "The build references a dependency or path that is unavailable in the CI checkout.",
      nextStep: "Check the import path, filename casing, and whether the dependency is declared and committed.",
    } },
    { pattern: /JavaScript heap out of memory|heap limit|out of memory/i, finding: {
      title: "The build ran out of memory",
      explanation: "A build or test process exceeded the available runner memory.",
      nextStep: "Reduce build memory use or split the job into smaller tasks.",
    } },
    { pattern: /EACCES|permission denied/i, finding: {
      title: "The workflow hit a permissions error",
      explanation: "A command or workflow step tried to access a file or GitHub resource without permission.",
      nextStep: "Check file permissions and the workflow's least-privilege permissions block.",
    } },
    { pattern: /timed out|timeout|exceeded the maximum execution time/i, finding: {
      title: "A workflow step timed out",
      explanation: "The step did not finish within its allowed time.",
      nextStep: "Inspect the last successful log lines for a stalled command or external service, then add retries or an appropriate timeout.",
    } },
    { pattern: /ENOENT|no such file or directory/i, finding: {
      title: "A required file or command is missing",
      explanation: "A workflow step expected a path or executable that was not present in the runner.",
      nextStep: "Check the working directory, checkout contents, and command availability in the runner.",
    } },
  ];
  return signatures.find((entry) => entry.pattern.test(log))?.finding ?? {
    title: "The workflow failed without a recognized error signature",
    explanation: "GitHub marked the job as failed. The excerpt below is the end of the failed job log for manual inspection.",
    nextStep: "Open the full job in GitHub and inspect the first error above the final exit code.",
  };
}

function safeLogText(input: string): string {
  return input
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[redacted token]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted key]")
    .replace(/(["']?(?:authorization|password|secret(?:[_-][a-z0-9_-]+)?|token|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*["']?)[^\s,"']+/gi, "$1[redacted]");
}

async function fetchGithubLogArchive(options: {
  token: string;
  fetch: FetchLike;
  owner: string;
  name: string;
  jobId: number;
}): Promise<string> {
  let response: Response;
  try {
    response = await options.fetch(`${API}${apiRepoPath(options.owner, options.name)}/actions/jobs/${options.jobId}/logs`, {
      headers: githubHeaders(options.token),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new IntegrationError(502, "Could not download the GitHub Actions log. Check the connection and try again.", "github_actions_network");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : null;
    throw integrationFailure(response.status, record, options.token);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 32 * 1024 * 1024) {
    throw new IntegrationError(413, "This job log archive exceeds the 32 MB limit.", "github_actions_log_limit");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) throw new IntegrationError(502, "GitHub returned an empty job log archive.", "github_actions_log_format");
  const chunks: Buffer[] = [];
  let archiveSize = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    archiveSize += value.length;
    if (archiveSize > 32 * 1024 * 1024) {
      await reader.cancel().catch(() => {});
      throw new IntegrationError(413, "This job log archive exceeds the 32 MB limit.", "github_actions_log_limit");
    }
    chunks.push(Buffer.from(value));
  }
  const archive = Buffer.concat(chunks, archiveSize);
  try {
    const parsed = parseProjectZip(archive);
    return safeLogText(parsed.files.map((file) => file.data.toString("utf8")).join("\n\n")).slice(-80_000);
  } catch (error) {
    if (error instanceof ProjectImportError) {
      // Some GitHub or proxy responses provide plain text instead of the ZIP.
      if (archive.subarray(0, 2).toString() !== "PK") return safeLogText(archive.toString("utf8")).slice(-80_000);
      throw new IntegrationError(502, "GitHub returned an unreadable job log archive.", "github_actions_log_format");
    }
    throw error;
  }
}

export async function diagnoseGithubWorkflowRun(options: {
  token: string;
  repository: string;
  runId: number;
  fetch: FetchLike;
}): Promise<{
  repository: string;
  run: GithubWorkflowRun;
  jobs: Array<{ id: number; name: string; conclusion: string; url: string; diagnosis: CiFinding; evidence: string[]; logExcerpt: string }>;
}> {
  if (!Number.isSafeInteger(options.runId) || options.runId <= 0) {
    throw new IntegrationError(400, "Choose a valid GitHub Actions run.", "github_actions_run");
  }
  const { owner, name, fullName } = parseRepository(options.repository);
  const apiOptions = { token: options.token, fetch: options.fetch };
  const repoPath = apiRepoPath(owner, name);
  const rawRun = await githubRequest(`${repoPath}/actions/runs/${options.runId}`, apiOptions);
  if (rawRun.id !== options.runId) throw new IntegrationError(404, "GitHub did not return the selected workflow run.", "github_actions_run");
  const rawJobs = await githubRequest(`${repoPath}/actions/runs/${options.runId}/jobs?per_page=100`, apiOptions);
  const failedJobs = Array.isArray(rawJobs.jobs) ? rawJobs.jobs.filter((job): job is Record<string, unknown> =>
    typeof job === "object" && job !== null && typeof (job as Record<string, unknown>).id === "number"
      && ["failure", "timed_out", "action_required"].includes(String((job as Record<string, unknown>).conclusion)),
  ).slice(0, 5) : [];
  const jobs = [];
  for (const job of failedJobs) {
    const jobId = job.id as number;
    const logExcerpt = await fetchGithubLogArchive({ token: options.token, fetch: options.fetch, owner, name, jobId });
    const lines = logExcerpt.split(/\r?\n/).filter((line) => line.trim() !== "");
    const diagnosis = diagnoseLog(logExcerpt);
    const evidence = lines.filter((line) => /error|failed|fatal|not found|cannot find|TS\d{4}|exception|traceback|denied|timeout|lockfile|npm ERR/i.test(line)).slice(-6);
    jobs.push({
      id: jobId,
      name: typeof job.name === "string" ? job.name : `Job ${jobId}`,
      conclusion: typeof job.conclusion === "string" ? job.conclusion : "failure",
      url: typeof job.html_url === "string" ? job.html_url : `https://github.com/${fullName}/actions/runs/${options.runId}`,
      diagnosis,
      evidence: evidence.length > 0 ? evidence : lines.slice(-6),
      logExcerpt: logExcerpt.slice(-12_000),
    });
  }
  const run: GithubWorkflowRun = {
    id: options.runId,
    name: typeof rawRun.name === "string" ? rawRun.name : "GitHub Actions",
    title: typeof rawRun.display_title === "string" ? rawRun.display_title : "Workflow run",
    branch: typeof rawRun.head_branch === "string" ? rawRun.head_branch : "unknown",
    status: typeof rawRun.status === "string" ? rawRun.status : "unknown",
    conclusion: typeof rawRun.conclusion === "string" ? rawRun.conclusion : null,
    event: typeof rawRun.event === "string" ? rawRun.event : "unknown",
    createdAt: typeof rawRun.created_at === "string" ? rawRun.created_at : "",
    url: typeof rawRun.html_url === "string" ? rawRun.html_url : `https://github.com/${fullName}/actions/runs/${options.runId}`,
  };
  return { repository: fullName, run, jobs };
}

async function createBlobs(
  files: GithubFile[],
  options: GithubRequestOptions,
): Promise<Array<{ path: string; mode: "100644"; type: "blob"; sha: string }>> {
  const output: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const index = next++;
      const file = files[index]!;
      const blob = await githubRequest("/git/blobs", {
        ...options,
        method: "POST",
        body: { content: file.data.toString("base64"), encoding: "base64" },
      });
      if (typeof blob.sha !== "string") throw new IntegrationError(502, "GitHub did not return a file object id.", "github_provider");
      output[index] = { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, () => worker()));
  return output;
}

export async function publishGithubProject(options: {
  sandboxRoot: string;
  token: string;
  repository: string;
  branch?: string;
  message?: string;
  includeWorkflow: boolean;
  reviewedFiles: boolean;
  fetch: FetchLike;
}): Promise<{
  repository: string;
  branch: string;
  files: number;
  commit: string | null;
  commitUrl: string | null;
  workflowAdded: boolean;
  workflowSavedLocally: boolean;
  localSyncStateSaved: boolean;
  alreadyUpToDate: boolean;
}> {
  if (!options.reviewedFiles) {
    throw new IntegrationError(400, "Review the included file list and confirm it is safe to publish before continuing.", "github_review_required");
  }
  const { owner, name, fullName } = parseRepository(options.repository);
  const apiOptions = { token: options.token, fetch: options.fetch };
  const verified = await verifyGithubAccess({ ...apiOptions, repository: fullName });
  const repo = await githubRequest(apiRepoPath(owner, name), apiOptions);
  const branchInput = options.branch?.trim() ?? "";
  const branch = branchInput || verified.defaultBranch || "main";
  const branchSegments = branch.split("/");
  if (branch.length > 200
    || !/^[A-Za-z0-9._/-]+$/.test(branch)
    || branch.includes("..")
    || branch.includes("//")
    || branch.startsWith("/")
    || branch.endsWith("/")
    || branch.endsWith(".")
    || branchSegments.some((segment) => segment.startsWith(".") || segment.toLowerCase().endsWith(".lock"))) {
    throw new IntegrationError(400, "Enter a valid Git branch name.", "github_branch");
  }

  const project = await collectGithubFiles(options.sandboxRoot);
  const files = project.files;
  if (files.length === 0) {
    throw new IntegrationError(422, "Build a project before publishing it to GitHub.", "github_empty_project");
  }
  let workflowAdded = false;
  if (options.includeWorkflow && !files.some((file) => file.path === WORKFLOW_PATH)) {
    files.push({ path: WORKFLOW_PATH, data: Buffer.from(WORKFLOW, "utf8") });
    files.sort((left, right) => left.path.localeCompare(right.path));
    workflowAdded = true;
  }

  let targetRef: Record<string, unknown> | null = null;
  try {
    targetRef = await githubRequest(`${apiRepoPath(owner, name)}/git/ref/heads/${apiBranchPath(branch)}`, apiOptions);
  } catch (error) {
    if (!(error instanceof IntegrationError) || error.code !== "github_not_found") throw error;
  }

  let parentCommit = "";
  const targetObject = targetRef?.object as Record<string, unknown> | undefined;
  if (typeof targetObject?.sha === "string") {
    parentCommit = targetObject.sha;
  } else {
    const defaultBranch = typeof repo.default_branch === "string" ? repo.default_branch : "";
    if (defaultBranch !== "" && defaultBranch !== branch) {
      try {
        const defaultRef = await githubRequest(`${apiRepoPath(owner, name)}/git/ref/heads/${apiBranchPath(defaultBranch)}`, apiOptions);
        const defaultObject = defaultRef.object as Record<string, unknown> | undefined;
        if (typeof defaultObject?.sha === "string") parentCommit = defaultObject.sha;
      } catch (error) {
        if (!(error instanceof IntegrationError) || error.code !== "github_not_found") throw error;
      }
    }
  }

  let parentTree = "";
  if (parentCommit !== "") {
    const commit = await githubRequest(`${apiRepoPath(owner, name)}/git/commits/${encodeURIComponent(parentCommit)}`, apiOptions);
    const tree = commit.tree as Record<string, unknown> | undefined;
    if (typeof tree?.sha === "string") parentTree = tree.sha;
  }

  const manifest = await readManifest(options.sandboxRoot);
  const priorPaths = manifest?.repository.toLowerCase() === fullName.toLowerCase() && manifest.branch === branch
    ? manifest.paths
    : [];
  const currentPaths = new Set(files.map((file) => file.path));
  const deletions = priorPaths.filter((filePath) => !currentPaths.has(filePath));

  const existingBlobs = new Map<string, string>();
  if (parentTree !== "") {
    const tree = await githubRequest(`${apiRepoPath(owner, name)}/git/trees/${encodeURIComponent(parentTree)}?recursive=1`, apiOptions);
    if (tree.truncated === true) {
      throw new IntegrationError(413, "This GitHub repository has too many files for a safe Studio sync. Use a smaller repository.", "github_tree_limit");
    }
    if (Array.isArray(tree.tree)) {
      for (const item of tree.tree) {
        if (typeof item !== "object" || item === null) continue;
        const entry = item as Record<string, unknown>;
        if (entry.type === "blob" && typeof entry.path === "string" && typeof entry.sha === "string") {
          existingBlobs.set(entry.path, entry.sha);
        }
      }
    }
  }
  if (workflowAdded) {
    const remoteWorkflowSha = existingBlobs.get(WORKFLOW_PATH);
    const generatedWorkflowSha = gitBlobSha(Buffer.from(WORKFLOW, "utf8"));
    if (remoteWorkflowSha !== undefined && remoteWorkflowSha !== generatedWorkflowSha) {
      throw new IntegrationError(409, "The repository already has a different Authenik8 Actions workflow. Studio will not overwrite it; sync that file into the project or uncheck the Actions option.", "github_workflow_exists");
    }
  }
  const changedFiles = files.filter((file) => existingBlobs.get(file.path) !== gitBlobSha(file.data));
  const treeEntries = await createBlobs(changedFiles, apiOptions);
  for (const filePath of deletions) {
    treeEntries.push({ path: filePath, mode: "100644", type: "blob", sha: "" });
  }
  const treeRequest = treeEntries.map((entry) => entry.sha === ""
    ? { path: entry.path, mode: entry.mode, type: entry.type, sha: null }
    : entry);
  const treeBody: Record<string, unknown> = { tree: treeRequest };
  if (parentTree !== "") treeBody.base_tree = parentTree;
  const createdTree = await githubRequest(`${apiRepoPath(owner, name)}/git/trees`, {
    ...apiOptions,
    method: "POST",
    body: treeBody,
  });
  if (typeof createdTree.sha !== "string") throw new IntegrationError(502, "GitHub did not return a project tree.", "github_provider");
  if (createdTree.sha === parentTree && parentCommit !== "") {
    let workflowSavedLocally = true;
    if (workflowAdded) {
      try {
        const workflowFullPath = path.join(options.sandboxRoot, ...WORKFLOW_PATH.split("/"));
        await mkdir(path.dirname(workflowFullPath), { recursive: true });
        await writeFile(workflowFullPath, WORKFLOW, { flag: "wx" });
      } catch {
        workflowSavedLocally = false;
      }
    }
    const manifestPaths = files
      .filter((file) => !(workflowAdded && !workflowSavedLocally && file.path === WORKFLOW_PATH))
      .map((file) => file.path);
    let localSyncStateSaved = true;
    try {
      await mkdir(path.dirname(manifestPath(options.sandboxRoot)), { recursive: true });
      await writeFile(manifestPath(options.sandboxRoot), JSON.stringify({
        repository: fullName,
        branch,
        paths: manifestPaths,
      } satisfies GithubManifest, null, 2), "utf8");
    } catch {
      localSyncStateSaved = false;
    }
    return {
      repository: verified.repository,
      branch,
      files: files.length,
      commit: parentCommit,
      commitUrl: null,
      workflowAdded: false,
      workflowSavedLocally,
      localSyncStateSaved,
      alreadyUpToDate: true,
    };
  }

  const commit = await githubRequest(`${apiRepoPath(owner, name)}/git/commits`, {
    ...apiOptions,
    method: "POST",
    body: {
      message: (options.message?.trim() || "Publish project from Authenik8 Studio").slice(0, 200),
      tree: createdTree.sha,
      parents: parentCommit === "" ? [] : [parentCommit],
    },
  });
  if (typeof commit.sha !== "string") throw new IntegrationError(502, "GitHub did not return a commit id.", "github_provider");

  if (targetRef === null) {
    await githubRequest(`${apiRepoPath(owner, name)}/git/refs`, {
      ...apiOptions,
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
  } else {
    await githubRequest(`${apiRepoPath(owner, name)}/git/refs/heads/${apiBranchPath(branch)}`, {
      ...apiOptions,
      method: "PATCH",
      body: { sha: commit.sha, force: false },
    });
  }

  let workflowSavedLocally = true;
  if (workflowAdded) {
    try {
      const workflowFullPath = path.join(options.sandboxRoot, ...WORKFLOW_PATH.split("/"));
      await mkdir(path.dirname(workflowFullPath), { recursive: true });
      await writeFile(workflowFullPath, WORKFLOW, { flag: "wx" });
    } catch {
      workflowSavedLocally = false;
    }
  }

  let localSyncStateSaved = true;
  try {
    await mkdir(path.dirname(manifestPath(options.sandboxRoot)), { recursive: true });
    await writeFile(manifestPath(options.sandboxRoot), JSON.stringify({
      repository: fullName,
      branch,
      paths: files
        .filter((file) => !(workflowAdded && !workflowSavedLocally && file.path === WORKFLOW_PATH))
        .map((file) => file.path),
    } satisfies GithubManifest, null, 2), "utf8");
  } catch {
    localSyncStateSaved = false;
  }

  return {
    repository: verified.repository,
    branch,
    files: files.length,
    commit: commit.sha,
    commitUrl: typeof commit.html_url === "string" ? commit.html_url : null,
    workflowAdded,
    workflowSavedLocally,
    localSyncStateSaved,
    alreadyUpToDate: false,
  };
}

export function gitBlobSha(data: Buffer): string {
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data])).digest("hex");
}
