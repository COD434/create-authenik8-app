import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  PROJECT_DIR_NAME,
  bridgeArgv,
  packageBinPath,
  resolveBridge,
  seedSandboxFrom,
  spawnTemplateBridge,
  type TemplateSpec,
} from "../src/template-bridge.js";

const tempRoots: string[] = [];
const staging: string[] = [];

afterAll(async () => {
  for (const root of [...tempRoots, ...staging]) {
    await rm(root, { recursive: true, force: true });
  }
});

async function makeTemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

const baseSpec: TemplateSpec = {
  preset: "auth",
  database: "sqlite",
  runtime: "node",
  packageManager: "npm",
  usePrisma: true,
};

describe("bridge resolution", () => {
  it("prefers the AUTHENIK8_CLI_PATH clone's bin entry, spawned as node <bin>", async () => {
    const clone = await makeTemp("a8-clone-");
    await mkdir(path.join(clone, "dist"), { recursive: true });
    await writeFile(
      path.join(clone, "package.json"),
      JSON.stringify({ name: "create-authenik8-app", bin: { "create-authenik8-app": "dist/cli.js" } }),
      "utf8",
    );
    await writeFile(path.join(clone, "dist", "cli.js"), "// bin", "utf8");

    const bridge = resolveBridge({ AUTHENIK8_CLI_PATH: clone });
    expect(bridge).toEqual({ kind: "package", binPath: path.resolve(clone, "dist/cli.js") });
  });

  it("falls through to the host npx when the clone is unusable", async () => {
    // A clone path that resolves to nothing must NOT produce a package bridge.
    const missing = [path.join("definitely", "not", "here")];
    const bridge = resolveBridge({ AUTHENIK8_CLI_PATH: missing[0]! }, () => false);
    expect(bridge).toBeNull();
  });

  it("never hands out a nonexistent clone manifest or bin", async () => {
    expect(packageBinPath(path.join("definitely", "absent"))).toBeNull();
  });
});

describe("bridge argv", () => {
  it("always carries the studio guard flags the request cannot override", () => {
    const argv = bridgeArgv({ kind: "npx", npxCli: "npx-cli.js" }, baseSpec);
    for (const guard of ["--no-git", "--no-install", "--yes"]) {
      expect(argv).toContain(guard);
    }
    expect(argv[0]).toBe(process.execPath); // no shims in the chain
    expect(argv).toContain(PROJECT_DIR_NAME);
  });

  it("encodes the enum-constrained spec into CLI flags", () => {
    const argv = bridgeArgv(
      { kind: "package", binPath: "bin.js" },
      { ...baseSpec, preset: "fullstack", frontend: "react", oauthProviders: ["google", "github"] },
    );
    for (const flag of [
      "--preset=fullstack",
      "--frontend=react",
      "--oauth=google,github",
      "--database=sqlite",
      "--runtime=node",
      "--package-manager=npm",
      "--prisma",
    ]) {
      expect(argv).toContain(flag);
    }
  });

  it("emits --no-oauth when a preset can carry providers but none are chosen", () => {
    const argv = bridgeArgv(
      { kind: "package", binPath: "bin.js" },
      { ...baseSpec, preset: "auth-oauth", oauthProviders: [] },
    );
    expect(argv).toContain("--no-oauth");
  });
});

describe("spawn + seed with a stub bridge CLI", () => {
  it("builds the staged project and streams output lines as display data", async () => {
    const clone = await makeTemp("a8-stub-clone-");
    await mkdir(path.join(clone, "dist"), { recursive: true });
    await writeFile(
      path.join(clone, "package.json"),
      JSON.stringify({ name: "create-authenik8-app", bin: { "create-authenik8-app": "dist/cli.js" } }),
      "utf8",
    );
    // The stub receives argv exactly like the real CLI: [bin, projectName, ...flags].
    await writeFile(
      path.join(clone, "dist", "cli.js"),
      `import { mkdirSync, writeFileSync } from "node:fs";
const name = process.argv[2];
console.log("stub: generating", name);
console.error("stub: diagnostics go to stderr too");
mkdirSync(name, { recursive: true });
writeFileSync(\`\${name}/authenik8.json\`, JSON.stringify({ schemaVersion: 1, preset: "auth", engine: { version: 1 } }));
writeFileSync(\`\${name}/package.json\`, JSON.stringify({ scripts: { start: "node server.js" } }));
writeFileSync(\`\${name}/args.json\`, JSON.stringify(process.argv));
process.exit(0);
`,
      "utf8",
    );

    const cwd = await makeTemp("a8-stub-cwd-");
    const lines: string[] = [];
    const result = await spawnTemplateBridge({
      bridge: { kind: "package", binPath: path.join(clone, "dist", "cli.js") },
      spec: baseSpec,
      cwd,
      onLine: (line) => lines.push(line),
      shouldAbort: () => false,
    });

    expect(result.code).toBe(0);
    expect(result.cancelled).toBe(false);
    expect(lines.some((line) => line.startsWith("[out] stub: generating"))).toBe(true);
    expect(lines.some((line) => line.startsWith("[err] stub: diagnostics"))).toBe(true);

    const args = JSON.parse(await readFile(path.join(result.projectDir, "args.json"), "utf8")) as string[];
    for (const guard of ["--no-git", "--no-install", "--yes"]) {
      expect(args).toContain(guard); // the studio's flags reached the CLI argv
    }
  });

  it("seeds the sandbox: contents replaced, junk excluded, model files absent", async () => {
    const stagingRoot = await makeTemp("a8-stage-");
    const project = path.join(stagingRoot, PROJECT_DIR_NAME);
    await mkdir(path.join(project, "apps", "web"), { recursive: true });
    await mkdir(path.join(project, "node_modules", "leftovers"), { recursive: true });
    await mkdir(project, { recursive: true }); // after the mkdir dance above this is idempotent
    await writeFile(path.join(project, "authenik8.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");
    await writeFile(path.join(project, "package.json"), JSON.stringify({ scripts: { start: "node server.js" } }), "utf8");
    await writeFile(path.join(project, "apps", "web", "index.html"), "<h1>seeded</h1>", "utf8");
    await writeFile(path.join(project, "node_modules", "leftovers", "junk.js"), "//", "utf8");
    await mkdir(path.join(project, ".git"), { recursive: true });
    await writeFile(path.join(project, ".git", "HEAD"), "ref:", "utf8");

    const sandboxRoot = await makeTemp("a8-sandbox-");
    await writeFile(path.join(sandboxRoot, "old-chat-app.txt"), "previous life", "utf8");
    await mkdir(path.join(sandboxRoot, "stale-dir"), { recursive: true });
    await writeFile(path.join(sandboxRoot, "stale-dir", "x.txt"), "x", "utf8");

    const seeded = await seedSandboxFrom({ stagingProjectDir: project, sandboxRoot });

    expect(seeded.files).toBeGreaterThanOrEqual(3);
    const names = await readdir(sandboxRoot);
    expect(names).toContain("authenik8.json");
    expect(names).toContain("package.json");
    expect(names).toContain("apps");
    expect(names).not.toContain("old-chat-app.txt");
    expect(names).not.toContain("stale-dir");
    expect(names).not.toContain("node_modules");
    await expect(readFile(path.join(sandboxRoot, "apps", "web", "index.html"), "utf8")).resolves.toBe("<h1>seeded</h1>");
  });

  it("refuses to seed a staged project without a start script", async () => {
    const stagingRoot = await makeTemp("a8-badstage-");
    const project = path.join(stagingRoot, PROJECT_DIR_NAME);
    await mkdir(project, { recursive: true });
    await writeFile(path.join(project, "authenik8.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");
    await writeFile(path.join(project, "package.json"), JSON.stringify({ scripts: {} }), "utf8");

    const sandboxRoot = await makeTemp("a8-untouched-");
    await writeFile(path.join(sandboxRoot, "keep-me.txt"), "must survive a failed seed", "utf8");

    await expect(seedSandboxFrom({ stagingProjectDir: project, sandboxRoot })).rejects.toThrow(/scripts\.start/);
    // A refused seed must not have touched the sandbox.
    expect(await readdir(sandboxRoot)).toEqual(["keep-me.txt"]);
  });
});
