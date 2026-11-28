import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

/**
 * The template bridge: seed the sandbox with a REAL Authenik8-generated
 * project — the security stack is the CLI's job, never the chat model's.
 *
 * Two sources, in order of preference:
 * - AUTHENIK8_CLI_PATH — a local clone of create-authenik8-app; the CLI's
 *   bin entry is spawned as `node <bin>` (no npm .cmd shims, which no-shell
 *   spawn cannot resolve on Windows).
 * - the published CLI  — `node npx-cli.js --yes create-authenik8-app@<pin>`
 *   with the runner's exact npm-cli technique.
 *
 * The CLI stays the sole validator of its option matrix; the studio only
 * forwards flag-shaped data already constrained to enums, and surfaces CLI
 * failures as data. Generation happens in a staging directory OUTSIDE the
 * sandbox (the CLI stages internally and moves the project atomically); the
 * sandbox is only ever replaced after the staged project validates.
 */

export type TemplateSpec = {
  preset: "base" | "auth" | "auth-oauth" | "fullstack";
  frontend?: "react" | "lovable" | "next";
  oauthProviders?: Array<"google" | "github">;
  database: "sqlite" | "postgresql" | "supabase";
  /**
   * Omitted by default: the CLI refuses `--runtime` without
   * `--production-ready` for Express presets (observed live), and a dev
   * sandbox should not generate PM2 configs. Only a deliberate future
   * production-seeding flow should send it.
   */
  runtime?: "node" | "bun";
  packageManager: "npm" | "pnpm" | "bun";
  usePrisma: boolean;
  /** Seed the fullstack template's demo projects and Pro launch guide. */
  demo?: boolean;
};

/** The generated project's folder name inside the staging directory. */
export const PROJECT_DIR_NAME = "authenik8-studio-app";

export type Bridge =
  | { kind: "package"; binPath: string }
  | { kind: "npx"; npxCli: string };

/**
 * Resolve the bridge in the studio's environment. `exists` is injectable for
 * tests; the real call checks paths with existsSync. npm ships npx-cli.js
 * next to npm-cli.js (`<node dir>/node_modules/npm/bin`), which is why the
 * runner's technique carries over to the published-CLI path.
 */
export function resolveBridge(
  env: NodeJS.ProcessEnv,
  exists: (candidate: string) => boolean = existsSync,
): Bridge | null {
  const cliPath = env.AUTHENIK8_CLI_PATH;
  if (cliPath !== undefined && cliPath.length > 0) {
    const binPath = packageBinPath(cliPath);
    if (binPath !== null && exists(binPath)) return { kind: "package", binPath };
  }
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (exists(npxCli)) return { kind: "npx", npxCli };
  return null;
}

/** The CLI's package.json `bin` entry, resolved against the clone. */
export function packageBinPath(cliPath: string): string | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(path.join(cliPath, "package.json"), "utf8"));
  } catch {
    return null; // no readable manifest: not a usable clone
  }
  if (manifest === null || typeof manifest !== "object") return null;
  const bin = (manifest as { bin?: Record<string, string> | string }).bin;
  const binRelative =
    bin === undefined
      ? null
      : typeof bin === "string"
        ? bin
        : (bin["create-authenik8-app"] ?? Object.values(bin)[0]);
  if (binRelative === undefined || binRelative === null || binRelative.length === 0) return null;
  return path.resolve(cliPath, binRelative);
}

/**
 * The final, complete argv for the bridge spawn. The studio ALWAYS appends
 * the guard flags itself:
 * - `--no-install`: the run installs when the user clicks Run, not here;
 * - `--no-git`: no repository is created inside the sandbox;
 * - `--yes`: non-interactive with all choices passed explicitly — a hung
 *   prompt would dead-lock the browser stream.
 * The virtual flags never come from the request; they are ours.
 */
const ALLOWED_PRESETS = new Set<TemplateSpec["preset"]>(["base", "auth", "auth-oauth", "fullstack"]);
const ALLOWED_FRONTENDS = new Set<NonNullable<TemplateSpec["frontend"]>>(["react", "lovable", "next"]);
const ALLOWED_OAUTH = new Set<NonNullable<TemplateSpec["oauthProviders"]>[number]>(["google", "github"]);
const ALLOWED_DATABASES = new Set<TemplateSpec["database"]>(["sqlite", "postgresql", "supabase"]);
const ALLOWED_RUNTIMES = new Set<NonNullable<TemplateSpec["runtime"]>>(["node", "bun"]);
const ALLOWED_PACKAGE_MANAGERS = new Set<TemplateSpec["packageManager"]>(["npm", "pnpm", "bun"]);

function assertAllowed<T extends string>(value: T, allowed: Set<T>, label: string): T {
  if (!allowed.has(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

export function bridgeArgv(bridge: Bridge, spec: TemplateSpec): string[] {
  const preset = assertAllowed(spec.preset, ALLOWED_PRESETS, "preset");
  const database = assertAllowed(spec.database, ALLOWED_DATABASES, "database");
  const packageManager = assertAllowed(spec.packageManager, ALLOWED_PACKAGE_MANAGERS, "packageManager");

  const projectFlags = [
    `--preset=${preset}`,
    ...(spec.frontend !== undefined
      ? [`--frontend=${assertAllowed(spec.frontend, ALLOWED_FRONTENDS, "frontend")}`]
      : []),
    ...(spec.oauthProviders !== undefined
      ? spec.oauthProviders.length > 0
        ? [`--oauth=${spec.oauthProviders.map((p) => assertAllowed(p, ALLOWED_OAUTH, "oauth provider")).join(",")}`]
        : ["--no-oauth"]
      : preset === "fullstack"
        ? ["--no-oauth"]
        : []),
    `--database=${database}`,
    ...(spec.runtime !== undefined
      ? [`--runtime=${assertAllowed(spec.runtime, ALLOWED_RUNTIMES, "runtime")}`]
      : []),
    `--package-manager=${packageManager}`,
    spec.usePrisma ? "--prisma" : "--no-prisma",
    ...(spec.demo === true ? ["--demo"] : []),
    "--no-git",
    "--no-install",
    "--yes",
  ];
  if (bridge.kind === "package") {
    return [process.execPath, bridge.binPath, PROJECT_DIR_NAME, ...projectFlags];
  }
  return [process.execPath, bridge.npxCli, "--yes", "create-authenik8-app@2", PROJECT_DIR_NAME, ...projectFlags];
}

export type BridgeSpawnResult = {
  code: number | null;
  /** Null when the child was cancelled via client disconnect. */
  cancelled: boolean;
  projectDir: string;
};

export type BridgeSpawnOptions = {
  bridge: Bridge;
  spec: TemplateSpec;
  cwd: string;
  onLine(line: string): void;
  shouldAbort(): boolean;
};

/**
 * Spawn the bridge CLI inside `cwd`. Output lines are untrusted display
 * data (`onLine` receives them; never parsed as instructions). The project
 * lands in `cwd/<PROJECT_DIR_NAME>` when the child exits zero. `shouldAbort`
 * is polled at 250ms — the wire contract is the caller's business, the
 * process-tree kill is ours.
 */
function assertBridgeArgv(argv: string[]): [string, string[]] {
  const [command, ...args] = argv;
  if (command !== process.execPath) throw new Error("Template bridge command must be the current Node executable.");
  const scriptArg = args[0];
  if (typeof scriptArg !== "string" || !path.isAbsolute(scriptArg) || !/\.(?:c|m)?js$/u.test(scriptArg)) {
    throw new Error("Template bridge script must be an absolute JavaScript path.");
  }
  if (args.some((arg) => arg.includes("\0"))) throw new Error("Template bridge argument contains a null byte.");
  return [command, args];
}

export function spawnTemplateBridge(options: BridgeSpawnOptions): Promise<BridgeSpawnResult> {
  const [command, args] = assertBridgeArgv(bridgeArgv(options.bridge, options.spec));
  const projectDir = path.join(options.cwd, PROJECT_DIR_NAME);
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    let settled = false;
    let cancelled = false;
    const outTail = { value: "" };
    const errTail = { value: "" };
    const drain = (chunk: string, tailOwner: { value: string }, label: "out" | "err"): void => {
      tailOwner.value += chunk;
      const lines = tailOwner.value.split(/\r?\n/);
      tailOwner.value = lines.pop() ?? "";
      for (const line of lines) { const trimmed = line.replace(/\s+$/, ""); if (trimmed.length > 0) options.onLine(`[${label}] ${trimmed}`); }
    };
    child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => drain(chunk, outTail, "out"));
    child.stderr?.on("data", (chunk: string) => drain(chunk, errTail, "err"));
    const finish = (finalCode: number | null, wasCancelled: boolean): void => {
      if (settled) return; settled = true; clearInterval(timer);
      for (const tail of [outTail, errTail]) { const leftover = tail.value.replace(/\s+$/, ""); if (leftover.length > 0) options.onLine(`[tail] ${leftover}`); }
      resolve({ code: finalCode, cancelled: wasCancelled, projectDir });
    };
    const timer = setInterval(() => { if (options.shouldAbort()) { cancelled = true; if (child.pid !== undefined) killTree(child.pid); } }, 250);
    timer.unref?.();
    child.on("error", (error: Error) => { options.onLine(`[error] ${error.message}`); finish(null, false); });
    child.on("close", (code) => finish(code, cancelled));
  });
}

/**
 * Kill a spawned tree. Mirrors the runner's Windows discipline
 * (taskkill /T takes down npm/shim children that a bare kill orphans).
 */
export function killTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    } else {
      spawn("kill", ["-TERM", String(pid)], { stdio: "ignore" });
    }
  } catch (error) {
    void error; // Best effort; nothing else to try.
  }
}

export type SeedOptions = {
  stagingProjectDir: string;
  sandboxRoot: string;
};

export type SeedResult = {
  files: number;
};

/**
 * Validate the staged project, wipe the sandbox, and copy the project in.
 * Validation is INTENTIONALLY light — an authenik8.json manifest with a
 * schema version plus a package.json with scripts.start is the shape the
 * studio's run contract actually depends on; full spec validation is the
 * CLI's job (it ran just now). node_modules and git metadata are never
 * copied: Run installs, and a nested repository would confuse everything.
 */
export async function seedSandboxFrom(options: SeedOptions): Promise<SeedResult> {
  const manifestPath = path.join(options.stagingProjectDir, "authenik8.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown> | null;
  if (manifest === null || typeof manifest !== "object" || typeof manifest.schemaVersion !== "number") {
    throw new Error("staged project has no readable authenik8.json manifest");
  }
  const pkg = JSON.parse(
    await readFile(path.join(options.stagingProjectDir, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  if (typeof pkg?.scripts?.start !== "string") {
    throw new Error("staged project has no scripts.start — Run would fail closed; not seeding");
  }

  for (const entry of await readdir(options.sandboxRoot)) {
    // fs.rm on a symlink removes the link, never the target — safe.
    await rm(path.join(options.sandboxRoot, entry), { recursive: true, force: true });
  }

  let files = 0;
  await cp(options.stagingProjectDir, options.sandboxRoot, {
    recursive: true,
    filter: (source: string) => {
      const name = path.basename(source);
      if (name === "node_modules" || name === ".git") return false;
      if (source !== options.stagingProjectDir) files += 1;
      return true;
    },
  });
  return { files };
}
