import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { generateProjectFixture, type GeneratedProject } from "../helpers/generator.js";

const execFileAsync = promisify(execFile);
const projects: GeneratedProject[] = [];

async function generatedFullstack() {
  const project = await generateProjectFixture({
    template: "fullstack",
    database: "postgresql",
  });
  projects.push(project);
  return project;
}

async function fakeNpm(project: GeneratedProject) {
  const fakeBin = path.join(project.rootDir, "fake-bin");
  const npmPath = path.join(fakeBin, process.platform === "win32" ? "npm.cmd" : "npm");
  const callLog = path.join(project.rootDir, "npm-calls.log");
  await fs.ensureDir(fakeBin);
  if (process.platform === "win32") {
    await fs.writeFile(npmPath, "@echo %*>>%NPM_CALL_LOG%\r\n");
  } else {
    await fs.writeFile(npmPath, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NPM_CALL_LOG"\n');
    await fs.chmod(npmPath, 0o755);
  }
  return { fakeBin, callLog };
}

async function fakeEmbeddedDatabase(project: GeneratedProject) {
  const modules = {
    "@electric-sql/pglite": `
      import { stat } from "node:fs/promises";

      export class PGlite {
        static async create(databaseDirectory) {
          const directory = await stat(databaseDirectory);
          if (!directory.isDirectory()) {
            throw new Error("Embedded database path is not a directory");
          }
          return new PGlite();
        }

        async close() {}
      }
    `,
    "@electric-sql/pglite-socket": `
      export class PGLiteSocketServer {
        async start() {}
        async stop() {}
        getServerConn() {
          return "127.0.0.1:55432";
        }
      }
    `,
  };

  await Promise.all(
    Object.entries(modules).map(async ([name, source]) => {
      const moduleDirectory = path.join(project.targetDir, "node_modules", name);
      await fs.ensureDir(moduleDirectory);
      await fs.writeJson(path.join(moduleDirectory, "package.json"), {
        name,
        type: "module",
        exports: "./index.js",
      });
      await fs.writeFile(path.join(moduleDirectory, "index.js"), source);
    }),
  );
}

async function runLocal(
  project: GeneratedProject,
  action: string,
  env: NodeJS.ProcessEnv,
) {
  return execFileAsync(
    process.execPath,
    [path.join(project.targetDir, "scripts/run-local.mjs"), action],
    {
      cwd: project.targetDir,
      env: { ...process.env, ...env },
    },
  );
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map((project) => project.cleanup()));
});

describe("fullstack local onboarding", () => {
  it("creates the embedded database directory for a fresh project", async () => {
    const project = await generatedFullstack();
    const { fakeBin, callLog } = await fakeNpm(project);
    const databaseDirectory = path.join(project.targetDir, ".authenik8", "postgres");
    await fakeEmbeddedDatabase(project);

    expect(await fs.pathExists(databaseDirectory)).toBe(false);

    await runLocal(project, "setup", {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      NPM_CALL_LOG: callLog,
      AUTHENIK8_LOCAL_DATABASE: "embedded",
    });

    expect(await fs.pathExists(databaseDirectory)).toBe(true);
    expect((await fs.readFile(callLog, "utf8")).trim().split("\n")).toEqual([
      "run db:migrate:apply",
      "run db:seed:apply",
    ]);
  });

  it("runs setup in order without Docker when an external database is selected", async () => {
    const project = await generatedFullstack();
    const { fakeBin, callLog } = await fakeNpm(project);

    await runLocal(project, "setup", {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      NPM_CALL_LOG: callLog,
      AUTHENIK8_LOCAL_DATABASE: "external",
    });

    expect((await fs.readFile(callLog, "utf8")).trim().split("\n")).toEqual([
      "run db:migrate:apply",
      "run db:seed:apply",
    ]);
  });

  it("wires the one-command development path in migration, seed, watcher order", async () => {
    const project = await generatedFullstack();
    const { fakeBin, callLog } = await fakeNpm(project);

    await runLocal(project, "dev", {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      NPM_CALL_LOG: callLog,
      AUTHENIK8_LOCAL_DATABASE: "external",
    });

    expect((await fs.readFile(callLog, "utf8")).trim().split("\n")).toEqual([
      "run db:migrate:apply",
      "run db:seed:apply",
      "run dev:watch",
    ]);
  });

  it("uses project-local Prisma Postgres and contains no Docker startup dependency", async () => {
    const project = await generatedFullstack();
    const source = await fs.readFile(
      path.join(project.targetDir, "scripts/run-local.mjs"),
      "utf8",
    );

    expect(source).toContain('import("@electric-sql/pglite")');
    expect(source).toContain('import("@electric-sql/pglite-socket")');
    expect(source).toContain('path.join(projectRoot, ".authenik8", "postgres")');
    expect(source).not.toMatch(/docker/i);
  });
});
