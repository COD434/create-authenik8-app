import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

import { createProject, configurePackageJson } from "../dist/src/steps/createProject.js";
import { configurePrisma } from "../dist/src/steps/configurePrisma.js";
import { installAuth } from "../dist/src/steps/installAuth.js";
import { writeProjectManifest } from "../dist/src/lib/projectManifest.js";

const preset = process.argv[2];
const lovable = process.argv.includes("--lovable");
if (preset !== "auth-oauth" && preset !== "fullstack") {
  throw new Error("Usage: node scripts/verify-fresh-project.mjs <auth-oauth|fullstack> [--lovable]");
}
if (lovable && preset !== "fullstack") {
  throw new Error("--lovable only applies to the fullstack preset");
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "dist/src/bin/cli.js");
const generatorVersion = (await fs.readJson(path.join(repoRoot, "package.json"))).version;
const tempBase = process.env.AUTHENIK8_FRESH_ROOT ?? os.tmpdir();
await fs.ensureDir(tempBase);
const tempRoot = await mkdtemp(path.join(tempBase, `authenik8-fresh-${preset}-`));
const targetDir = path.join(tempRoot, "generated-app");
const state = {
  step: "prompts",
  projectName: "generated-app",
  framework: "Express",
  authMode: preset,
  usePrisma: true,
  database: preset === "fullstack" ? "postgresql" : "sqlite",
  useGit: false,
  runtime: "node",
  packageManager: "npm",
  oauthProviders: ["google", "github"],
  ...(lovable ? { frontend: "lovable" } : {}),
};

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: createFreshProjectEnv(),
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

<<<<<<< HEAD
function createFreshProjectEnv(overrides = {}) {
  const environment = { ...process.env };

  for (const key of Object.keys(environment)) {
    if (
      ["redis_url", "redis_host", "redis_port", "redis_password"].includes(key.toLowerCase())
      || key.toLowerCase() === "npm_config_allow_scripts"
    ) {
      delete environment[key];
    }
  }

  return {
    ...environment,
    REDIS_URL: "memory://",
    ...overrides,
  };
}

=======
>>>>>>> 6ce4a8b (addons: alot of tests features and broken func fixes)
function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local verification port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function runUntilOutput(command, args, cwd, expectedOutput, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
<<<<<<< HEAD
      env: createFreshProjectEnv(environment),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

=======
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
>>>>>>> 6ce4a8b (addons: alot of tests features and broken func fixes)
    let output = "";
    let ready = false;
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 15_000);

    const capture = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      if (!ready && output.includes(expectedOutput)) {
        ready = true;
        child.kill("SIGTERM");
      }
    };

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ready) resolve();
      else if (timedOut) reject(new Error(`Timed out waiting for ${expectedOutput}\n${output}`));
      else reject(new Error(`${command} exited with ${signal ?? code}\n${output}`));
    });
  });
}

async function useLocalCoreTarball(tarballPath) {
  if (!tarballPath) return;
  const dependency = `file:${path.resolve(tarballPath)}`;
  const packagePath = preset === "fullstack"
    ? path.join(targetDir, "apps/api/package.json")
    : path.join(targetDir, "package.json");
  const pkg = await fs.readJson(packagePath);
  pkg.dependencies["authenik8-core"] = dependency;
  await fs.writeJson(packagePath, pkg, { spaces: 2 });
}

try {
  await createProject(state, targetDir, path.join(repoRoot, "templates"));
  if (preset === "auth-oauth") await installAuth(targetDir, "npm");
  await configurePrisma(state, targetDir, path.join(repoRoot, "templates"));
  configurePackageJson(targetDir, true, "npm");
  await useLocalCoreTarball(process.env.AUTHENIK8_CORE_TARBALL);
  await writeProjectManifest(targetDir, {
    projectName: state.projectName,
    generatorVersion,
    preset: state.authMode,
    packageManager: state.packageManager,
    runtime: state.runtime,
    database: state.database,
    usePrisma: state.usePrisma,
    oauthProviders: state.oauthProviders,
    productionReady: false,
    ...(state.frontend ? { frontend: state.frontend } : {}),
  });

  await run("npm", ["install", "--no-audit", "--no-fund"], targetDir);
  const envPath = path.join(targetDir, ".env");
  const envBackupPath = path.join(targetDir, ".env.fresh-verification");
  await fs.move(envPath, envBackupPath);
  try {
    await run(
      process.execPath,
      [cliPath, "doctor", targetDir, "--ci", "--offline", "--strict"],
      repoRoot,
    );
  } finally {
    await fs.move(envBackupPath, envPath);
  }
  await run(
    process.execPath,
    [cliPath, "doctor", targetDir, "--deep", "--ci"],
    repoRoot,
  );
  if (!process.env.AUTHENIK8_CORE_TARBALL) {
    await run(
      process.execPath,
      [cliPath, "upgrade", targetDir, "--check", "--json"],
      repoRoot,
    );
  }
  if (preset === "auth-oauth") {
    await run("npm", ["run", "db:migrate"], targetDir);
  }
  await run("npm", ["run", "test", "--if-present"], targetDir);
  if (lovable) {
    await run(
      process.execPath,
      [cliPath, "doctor", "frontend", "--target", "lovable", targetDir, "--json"],
      repoRoot,
    );
    await run("npm", ["run", "export:lovable-client"], targetDir);
    for (const archive of ["authenik8-contracts.tgz", "authenik8-api-client.tgz"]) {
      if (!(await fs.pathExists(path.join(targetDir, "integrations/lovable/vendor", archive)))) {
        throw new Error(`Lovable client export is missing ${archive}`);
      }
    }
  }
  await run("npm", ["audit", "--audit-level=low"], targetDir);
  await run("npm", ["run", "build"], targetDir);
  if (preset === "auth-oauth") {
    const port = await availablePort();
    await runUntilOutput(
      process.execPath,
      [path.join(targetDir, "dist/server.js")],
      targetDir,
      `Auth system running on http://localhost:${port}`,
<<<<<<< HEAD
      { NODE_ENV: "development", PORT: String(port), REDIS_URL: "memory://" },
=======
      { NODE_ENV: "development", PORT: String(port) },
>>>>>>> 6ce4a8b (addons: alot of tests features and broken func fixes)
    );
  }
  console.log(`Fresh ${preset} project installed and built successfully.`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
