import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";

import {
  generateProjectFixture,
  runGeneratedServerSmoke,
  type GeneratedProject,
} from "../helpers/generator.js";

const execFileAsync = promisify(execFile);
const projects: GeneratedProject[] = [];

async function fakeCommand(
  project: GeneratedProject,
  name: string,
  callLog: string,
): Promise<void> {
  const binaryDirectory = path.join(project.targetDir, "node_modules", ".bin");
  const binaryPath = path.join(
    binaryDirectory,
    process.platform === "win32" ? `${name}.cmd` : name,
  );
  await fs.ensureDir(binaryDirectory);
  if (process.platform === "win32") {
    await fs.writeFile(binaryPath, `@echo ${name} %*>>%COMMAND_LOG%\r\n`);
    return;
  }

  await fs.writeFile(
    binaryPath,
    `#!/bin/sh\nprintf "${name} %s\\n" "$*" >> "$COMMAND_LOG"\n`,
  );
  await fs.chmod(binaryPath, 0o755);
}

async function runNpmScript(
  project: GeneratedProject,
  script: string,
  callLog: string,
): Promise<void> {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  await execFileAsync(executable, ["run", script], {
    cwd: project.targetDir,
    env: { ...process.env, COMMAND_LOG: callLog },
  });
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map((project) => project.cleanup()));
});

describe("Express preset onboarding", () => {
  it("keeps the Redis adapter identical across Express presets", async () => {
    const sources = await Promise.all(
      [
        "templates/express-base/src/config/redis.ts",
        "templates/express-auth/src/config/redis.ts",
        "templates/express-auth+/src/config/redis.ts",
      ].map((file) => fs.readFile(path.resolve(file), "utf8")),
    );

    expect(new Set(sources).size).toBe(1);
  });

  it.each([
    { template: "base" as const, entryPath: "src/server.ts" },
    { template: "auth" as const, entryPath: "src/server.ts" },
    { template: "auth-oauth" as const, entryPath: "src/server.ts" },
  ])(
    "runs the generated $template development and migration commands",
    async (scenario) => {
      const project = await generateProjectFixture({
        template: scenario.template,
        database: "sqlite",
        hashLib: "bcryptjs",
      });
      projects.push(project);

      const callLog = path.join(project.rootDir, "command-calls.log");
      await Promise.all([
        fakeCommand(project, "prisma", callLog),
        fakeCommand(project, "ts-node-dev", callLog),
      ]);

      await runNpmScript(project, "db:migrate", callLog);
      expect((await fs.readFile(callLog, "utf8")).trim().split("\n")).toEqual([
        "prisma migrate dev --name init",
        "prisma generate",
      ]);

      await fs.writeFile(callLog, "");
      await runNpmScript(project, "dev", callLog);
      const developmentCalls = (await fs.readFile(callLog, "utf8"))
        .trim()
        .split("\n");
      expect(developmentCalls[0]).toBe("prisma generate");
      expect(developmentCalls[1]).toContain(
        "ts-node-dev --respawn --transpile-only",
      );

      const smoke = await runGeneratedServerSmoke(
        project.targetDir,
        scenario.entryPath,
      );
      expect(smoke.code, smoke.stderr).toBe(0);
      expect(smoke.stderr).toBe("");
    },
  );

  it("rejects the local Redis adapter in production", async () => {
    const project = await generateProjectFixture({
      template: "base",
      database: "sqlite",
    });
    projects.push(project);

    const smoke = await runGeneratedServerSmoke(
      project.targetDir,
      "src/server.ts",
      { NODE_ENV: "production" },
    );

    expect(smoke.code).not.toBe(0);
    expect(smoke.stderr).toContain("REDIS_URL=memory:// is for local development only");
  });
});
