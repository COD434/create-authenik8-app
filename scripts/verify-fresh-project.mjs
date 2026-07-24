import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

import { createProject, configurePackageJson } from "../dist/src/steps/createProject.js";
import { configurePrisma } from "../dist/src/steps/configurePrisma.js";
import { installAuth } from "../dist/src/steps/installAuth.js";

const preset = process.argv[2];
if (preset !== "auth-oauth" && preset !== "fullstack") {
  throw new Error("Usage: node scripts/verify-fresh-project.mjs <auth-oauth|fullstack>");
}

const repoRoot = path.resolve(import.meta.dirname, "..");
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
};

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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

function createFreshProjectEnv(overrides = {}) {
  const environment = { ...process.env };

  for (const key of [
    "REDIS_URL",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
  ]) {
    delete environment[key];
  }

  return {
    ...environment,
    REDIS_URL: "memory://",
    ...overrides,
  };
}

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
      env: createFreshProjectEnv(environment),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

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

  await run("npm", ["install", "--no-audit", "--no-fund"], targetDir);
  if (preset === "auth-oauth") {
    await run("npm", ["run", "db:migrate"], targetDir);
  }
  await run("npm", ["audit", "--omit=dev", "--audit-level=high"], targetDir);
  await run("npm", ["run", "build"], targetDir);
  if (preset === "auth-oauth") {
    const port = await availablePort();
    await runUntilOutput(
      process.execPath,
      [path.join(targetDir, "dist/server.js")],
      targetDir,
      `Auth system running on http://localhost:${port}`,
      { NODE_ENV: "development", PORT: String(port), REDIS_URL: "memory://" },
    );
  }
  console.log(`Fresh ${preset} project installed and built successfully.`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
