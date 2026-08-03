import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const npmCliPath = process.env.npm_execpath;
const subprocessEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.toLowerCase().includes("allow_scripts"),
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(executable, args, cwd) {
  try {
    return await exec(executable, args, {
      cwd,
      encoding: "utf8",
      env: subprocessEnvironment,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
    throw new Error(
      `${executable} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`,
      { cause: error },
    );
  }
}

function runNpm(args, cwd) {
  if (npmCliPath) {
    return run(process.execPath, [npmCliPath, ...args], cwd);
  }
  if (process.platform === "win32") {
    return run(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", "npm", ...args],
      cwd,
    );
  }
  return run("npm", args, cwd);
}

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "authenik8-studio-package-"),
);

try {
  const npmConfigPath = path.join(temporaryRoot, "isolated.npmrc");
  await fs.writeFile(npmConfigPath, "");
  const pack = await runNpm(
    [
      "--userconfig",
      npmConfigPath,
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      temporaryRoot,
    ],
    repositoryRoot,
  );
  const packResult = JSON.parse(pack.stdout);
  const packageResult = Array.isArray(packResult)
    ? packResult[0]
    : Object.values(packResult)[0];
  const filename = packageResult?.filename;
  assert(typeof filename === "string", "npm pack did not return a tarball name.");

  const consumerDirectory = path.join(temporaryRoot, "consumer");
  await fs.mkdir(consumerDirectory);
  await fs.writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({
      name: "studio-package-smoke",
      private: true,
      allowScripts: {},
    }, null, 2)}\n`,
  );
  await runNpm(
    [
      "--userconfig",
      npmConfigPath,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
      path.join(temporaryRoot, filename),
    ],
    consumerDirectory,
  );

  const installedRoot = path.join(
    consumerDirectory,
    "node_modules",
    "create-authenik8-app",
  );
  const cliPath = path.join(installedRoot, "dist", "src", "bin", "cli.js");
  await run(
    process.execPath,
    [
      cliPath,
      "studio-app",
      "--yes",
      "--preset",
      "base",
      "--no-prisma",
      "--no-git",
      "--no-install",
    ],
    consumerDirectory,
  );

  const studioModule = await import(
    pathToFileURL(
      path.join(
        installedRoot,
        "dist",
        "src",
        "commands",
        "studio",
        "index.js",
      ),
    ).href
  );
  const studio = await studioModule.runStudio({
    directory: path.join(consumerDirectory, "studio-app"),
    port: 0,
    openBrowser: false,
    help: false,
  });

  try {
    const [htmlResponse, scriptResponse, styleResponse, snapshotResponse] =
      await Promise.all([
        fetch(studio.url),
        fetch(`${studio.url}/assets/app.js`),
        fetch(`${studio.url}/assets/app.css`),
        fetch(`${studio.url}/api/snapshot`),
      ]);
    assert(htmlResponse.ok, "The packaged Studio HTML route failed.");
    assert(scriptResponse.ok, "The packaged Studio JavaScript route failed.");
    assert(styleResponse.ok, "The packaged Studio stylesheet route failed.");
    assert(snapshotResponse.ok, "The packaged Studio snapshot route failed.");
    assert(
      snapshotResponse.headers.get("content-security-policy")?.includes(
        "default-src 'none'",
      ),
      "The packaged Studio response is missing its restrictive CSP.",
    );

    const [html, script, style, snapshot] = await Promise.all([
      htmlResponse.text(),
      scriptResponse.text(),
      styleResponse.text(),
      snapshotResponse.json(),
    ]);
    assert(html.includes('id="root"'), "The packaged HTML is incomplete.");
    assert(
      script.includes("data-studio-ui"),
      "The packaged Astryx JavaScript bundle is incomplete.",
    );
    assert(
      style.includes("--auth-mint"),
      "The packaged Authenik8 theme bundle is incomplete.",
    );
    assert(
      snapshot.project?.name === "studio-app"
        && snapshot.project?.preset === "base"
        && snapshot.scan?.mode === "offline",
      "The packaged CLI returned an incompatible Studio snapshot.",
    );
  } finally {
    await studio.close();
  }

  process.stdout.write(
    "Packaged Studio generated a project and served its offline snapshot successfully.\n",
  );
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
