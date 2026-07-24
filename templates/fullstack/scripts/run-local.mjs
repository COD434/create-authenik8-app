import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(projectRoot, ".env");
const command = process.argv[2];
const commandScripts = {
  dev: ["db:migrate:apply", "db:seed:apply", "dev:watch"],
  migrate: ["db:migrate:apply"],
  seed: ["db:seed:apply"],
  setup: ["db:migrate:apply", "db:seed:apply"],
  studio: ["db:studio:apply"],
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
    //const executable = process.platform === "win32" ? "npm.cmd" : "npm";
    //const child = spawn(executable, ["run", script], {
      const { executable, args } = npmInvocation(script);
	const child = spawn(executable, args,{
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

if (!Object.hasOwn(commandScripts, command)) {
  console.error("Usage: node scripts/run-local.mjs <dev|migrate|seed|setup|studio>");
  process.exit(1);
}

let activeChild;
let receivedSignal;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    receivedSignal = signal;
    activeChild?.kill(signal);
  });
}

let database;
let failed = false;
try {
  const databaseMode = envValue("AUTHENIK8_LOCAL_DATABASE")?.toLowerCase() || "embedded";
  if (databaseMode !== "embedded" && databaseMode !== "external") {
    throw new Error("AUTHENIK8_LOCAL_DATABASE must be embedded or external");
  }

  const environment = { ...process.env };
  if (databaseMode === "embedded") {
    console.log("Starting the project-local PostgreSQL database...");
    database = await startEmbeddedDatabase();
    console.log("Project-local PostgreSQL is ready.");
  } else {
    console.log("Using DATABASE_URL from .env.");
  }

  for (const script of commandScripts[command]) {
    if (receivedSignal) break;
    await runScript(script, database
      ? {
        ...environment,
        DATABASE_URL: database.connectionString,
      }
      : environment);
  }
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nLocal startup failed: ${message}`);
  console.error(
    "Using an external PostgreSQL database? Set AUTHENIK8_LOCAL_DATABASE=external and update DATABASE_URL in .env.\n",
  );
} finally {
  await database?.close();
}

if (failed) {
  process.exitCode = 1;
} else if (receivedSignal) {
  process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
}
