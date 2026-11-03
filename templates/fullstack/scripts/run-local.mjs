import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env");
const manifestPath = path.join(projectRoot, "authenik8.json");
const command = process.argv[2];

/*
 * Watch development processes directly from this file instead of through a
 * process-pooling tool. Under nested cmd.exe / npm invocations on Windows a
 * pooled tree accepts connections but never answers requests, so `dev` and
 * `watch` orchestrate their watchers themselves with this process as the
 * single stdout pump. Keep the pool-spawn approach out of local startup.
 */
const commandScripts = {
  dev: { pre: ["db:migrate:apply", "db:seed:apply"], watchers: true },
  watch: { pre: ["build:packages"], watchers: true },
  lovable: { pre: ["db:migrate:apply", "db:seed:apply"], watchers: true },
  migrate: { pre: ["db:migrate:apply"] },
  seed: { pre: ["db:seed:apply"] },
  setup: { pre: ["db:migrate:apply", "db:seed:apply"] },
  studio: { pre: ["db:studio:apply"] },
};

function envValue(name) {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  try {
    const line = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  } catch {
    return undefined;
  }
}

function npmInvocation(script) {

  if (process.platform === "win32") {
    return {
      executable: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `npm run ${script}`],
    };
  }

  return {
    executable: "npm",
    args: ["run", script],
  };
}

function runScript(script, environment) {
  return new Promise((resolve, reject) => {
    const { executable, args } = npmInvocation(script);
    const child = spawn(executable, args, {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
    });

    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChild = undefined;
      if (code === 0 || receivedSignal) {
        resolve();
        return;
      }
      reject(new Error(`npm run ${script} exited with ${signal ?? code}`));
    });
  });
}

function manifestFrontendMode() {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const mode = manifest?.features?.frontend;
    if (mode === "lovable" || mode === "react" || mode === "next") return mode;
    return undefined;
  } catch {
    return undefined;
  }
}

function watcherDefinitions() {
  // Lovable mode hosts the frontend, so the just-generated local web watcher is
  // not started; the API builds run without the web workspace itself.
  const includeWeb = manifestFrontendMode() !== "lovable";
  const definitions = [
    { label: "contracts", workspace: "@authenik8/contracts", prefixCode: "\u001b[34;1m" },
    { label: "client", workspace: "@authenik8/api-client", prefixCode: "\u001b[32;1m" },
    { label: "ui", workspace: "@authenik8/ui", prefixCode: "\u001b[33;1m" },
    { label: "api", workspace: "@authenik8/api", prefixCode: "\u001b[36;1m" },
  ];
  if (includeWeb) {
    definitions.push({ label: "web", workspace: "@authenik8/web", prefixCode: "\u001b[35;1m" });
  }
  return definitions;
}

async function startEmbeddedDatabase() {
  const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite-socket"),
  ]);
  const databaseDirectory = path.join(projectRoot, ".authenik8", "postgres");
  mkdirSync(databaseDirectory, { recursive: true });
  const database = await PGlite.create(databaseDirectory);
  const server = new PGLiteSocketServer({
    db: database,
    host: "127.0.0.1",
    port: 55432,
    maxConnections: 20,
  });
  await server.start();

  return {
    connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/template1?sslmode=disable`,
    async close() {
      await server.stop();
      await database.close();
    },
  };
}

let watcherChildren = [];
let outputQueue = Promise.resolve();

function drainOutput(text) {
  outputQueue = outputQueue.then(async () => {
    if (process.stdout.write(text)) return;
    await new Promise((resolve) => {
      process.stdout.once("drain", resolve);
    });
  }).catch(() => {});
}

function pipeWatcherOutput(child, definition) {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    stream.setEncoding("utf8");
    let buffered = "";
    const prefix = process.stdout.isTTY
      ? `${definition.prefixCode}[${definition.label}]\u001b[0m `
      : `[${definition.label}] `;
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length > 0) drainOutput(`${prefix}${line}\n`);
      }
    });
    stream.on("end", () => {
      if (buffered.length > 0) drainOutput(`${prefix}${buffered}\n`);
    });
  }
}

function killChildren(children) {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  }
}

async function runWatchers(environment) {
  const definitions = watcherDefinitions();

  await runScript("build:packages", environment);

  const labels = definitions.map((definition) => definition.label).join(" | ");
  console.log(`Starting development watchers: ${labels}`);
  for (const definition of definitions) {
    const { executable, args } = npmInvocation(`dev -w ${definition.workspace}`);
    const child = spawn(executable, args, {
      cwd: projectRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    pipeWatcherOutput(child, definition);
    watcherChildren.push(child);
  }

  const exits = await Promise.all(
    watcherChildren.map(
      (child) =>
        new Promise((resolve) => {
          const definition = definitions[watcherChildren.indexOf(child)];
          child.once("exit", (code, signal) => {
            resolve({ label: definition?.label ?? "watcher", code, signal });
          });
        }),
    ),
  );
  killChildren(watcherChildren);

  for (const exit of exits) {
    if (exit.code === 0 || receivedSignal) continue;
    throw new Error(
      `watcher '${exit.label}' exited with ${exit.signal ?? exit.code}`,
    );
  }
}

if (!Object.hasOwn(commandScripts, command)) {
  console.error("Usage: node scripts/run-local.mjs <dev|lovable|migrate|seed|setup|studio|watch>");
  process.exit(1);
}

let activeChild;
let receivedSignal;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    receivedSignal = signal;
    killChildren(watcherChildren);
    activeChild?.kill(signal);
    killChildren(watcherChildren);
  });
}

let database;
let failed = false;
try {
  const databaseMode = envValue("AUTHENIK8_LOCAL_DATABASE")?.toLowerCase() || "embedded";
  if (databaseMode !== "embedded" && databaseMode !== "external") {
    throw new Error("AUTHENIK8_LOCAL_DATABASE must be embedded or external");
  }
  const configuredRedisUrl = envValue("REDIS_URL");

  const environment = { ...process.env,
    REDIS_URL: configuredRedisUrl ||
    (process.env.NODE_ENV === "production" ? process.env.REDIS_URL : "memory://")
  };

  if (databaseMode === "embedded") {
    console.log("Starting the project-local PostgreSQL database...");
    database = await startEmbeddedDatabase();
    console.log("Project-local PostgreSQL is ready.");
  } else {
    console.log("Using DATABASE_URL from .env.");
  }

  const runtimeEnvironment = database
    ? { ...environment, DATABASE_URL: database.connectionString }
    : environment;

  const scriptPlan = commandScripts[command];
  for (const script of scriptPlan.pre) {
    if (receivedSignal) break;
    activeChild = undefined;
    await runScript(script, runtimeEnvironment);
  }
  if (!receivedSignal && scriptPlan.watchers) {
    await runWatchers(runtimeEnvironment);
  }
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nLocal startup failed: ${message}`);
  console.error(
    "Using an external PostgreSQL database? Set AUTHENIK8_LOCAL_DATABASE=external and update DATABASE_URL in .env.\n",
  );
} finally {
  killChildren(watcherChildren);
  await database?.close();
}

if (failed) {
  process.exitCode = 1;
} else if (receivedSignal) {
  process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
}
