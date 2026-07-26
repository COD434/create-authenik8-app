import { spawnSync } from "child_process";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockModules = vi.hoisted(() => {
  const state = {
    promptAnswers: {
      framework: "Express",
      authMode: "base",
      usePrisma: true,
      database: "sqlite",
      useGit: false,
      runtime: "node",
    },
    showBootLogo: vi.fn(async () => {}),
    renderConfiguration: vi.fn(),
    startStep: vi.fn(),
    completeStep: vi.fn(),
    skipStep: vi.fn(),
    finishSteps: vi.fn(),
    formatDuration: vi.fn(() => "1.3s"),
    runPrompts: vi.fn(async () => state.promptAnswers),
    createProject: vi.fn(async () => {}),
    configurePackageJson: vi.fn(),
    writeProjectManifest: vi.fn(async () => ({})),
    installAuth: vi.fn(async () => "bcryptjs"),
    configurePrisma: vi.fn(async () => {}),
    configureGeneratedReadme: vi.fn(async () => {}),
    runPostGenerationDoctor: vi.fn(async () => ({
      passed: 12,
      warnings: 0,
      warningLabels: [],
    })),
    installDependencies: vi.fn(async () => ({ packageManager: "npm", durationMs: 1_250 })),
    detectPackageManager: vi.fn(() => "npm"),
    isPackageManagerAvailable: vi.fn(() => true),
    resolvePackageManagerForPreset: vi.fn((authMode, requested) =>
      authMode === "fullstack" ? "npm" : requested ?? "npm"
    ),
    configureProduction: vi.fn(async () => {}),
    initGit: vi.fn(async () => true),
    appendProductionReadme: vi.fn(),
    resolveRuntime: vi.fn((runtime: "node" | "bun" | undefined) => runtime ?? "node"),
    dockerComposeAvailable: vi.fn(() => false),
    dockerDaemonAvailable: vi.fn(() => false),
    killAllProcesses: vi.fn(),
    printSummary: vi.fn(),
    spinner: {
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: "",
      isSpinning: false,
    },
  };

  return state;
});

vi.mock("../../src/lib/ui.js", () => ({
  showBootLogo: mockModules.showBootLogo,
  renderConfiguration: mockModules.renderConfiguration,
  startStep: mockModules.startStep,
  completeStep: mockModules.completeStep,
  skipStep: mockModules.skipStep,
  finishSteps: mockModules.finishSteps,
  formatDuration: mockModules.formatDuration,
  spinner: mockModules.spinner,
}));

vi.mock("../../src/steps/prompts.js", () => ({
  runPrompts: mockModules.runPrompts,
}));

vi.mock("../../src/steps/createProject.js", () => ({
  createProject: mockModules.createProject,
  configurePackageJson: mockModules.configurePackageJson,
}));

vi.mock("../../src/lib/projectManifest.js", () => ({
  writeProjectManifest: mockModules.writeProjectManifest,
}));

vi.mock("../../src/steps/installAuth.js", () => ({
  installAuth: mockModules.installAuth,
}));

vi.mock("../../src/steps/configurePrisma.js", () => ({
  configurePrisma: mockModules.configurePrisma,
}));

vi.mock("../../src/steps/configureReadme.js", () => ({
  configureGeneratedReadme: mockModules.configureGeneratedReadme,
}));

vi.mock("../../src/commands/doctor/postGeneration.js", () => ({
  runPostGenerationDoctor: mockModules.runPostGenerationDoctor,
}));

vi.mock("../../src/steps/installDeps.js", () => ({
  installDependencies: mockModules.installDependencies,
  detectPackageManager: mockModules.detectPackageManager,
  isPackageManagerAvailable: mockModules.isPackageManagerAvailable,
  resolvePackageManagerForPreset: mockModules.resolvePackageManagerForPreset,
}));

vi.mock("../../src/steps/finalSetup.js", () => ({
  configureProduction: mockModules.configureProduction,
  initGit: mockModules.initGit,
  appendProductionReadme: mockModules.appendProductionReadme,
  resolveRuntime: mockModules.resolveRuntime,
}));

vi.mock("../../src/utils/output.js", () => ({
  printSummary: mockModules.printSummary,
}));

vi.mock("../../src/lib/process.js", () => ({
  dockerComposeAvailable: mockModules.dockerComposeAvailable,
  dockerDaemonAvailable: mockModules.dockerDaemonAvailable,
  killAllProcesses: mockModules.killAllProcesses,
}));

type CliRunResult = {
  exitCode?: number;
  logs: string[];
  errors: string[];
  cwd: string;
};

type CliSubprocessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const tsxLoaderPath = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const tsxLoaderUrl = pathToFileURL(tsxLoaderPath).href;

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

async function runCliSubprocess(argv: string[], cwd: string): Promise<CliSubprocessResult> {
  const child = spawnSync(
    process.execPath,
    ["--import", tsxLoaderUrl, path.join(repoRoot, "src/bin/index.ts"), ...argv],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        CI: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (child.error) {
    throw child.error;
  }

  return {
    code: child.status,
    stdout: normalizeText(child.stdout ?? ""),
    stderr: normalizeText(child.stderr ?? ""),
  };
}

async function runCli(
  argv: string[],
  options: {
    promptAnswers?: Partial<typeof mockModules.promptAnswers>;
    createExistingTargetDir?: boolean;
    savedState?: Record<string, unknown>;
  } = {},
): Promise<CliRunResult> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
  const previousArgv = [...process.argv];
  const previousCwd = process.cwd();
  const previousSigintListeners = process.listeners("SIGINT");
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  mockModules.promptAnswers = {
    framework: "Express",
    authMode: "base",
    usePrisma: true,
    database: "sqlite",
    useGit: false,
    runtime: "node",
    ...options.promptAnswers,
  };

  const packageManagerIndex = argv.findIndex((arg) => arg === "--package-manager");
  const packageManagerValueIndex = packageManagerIndex >= 0 ? packageManagerIndex + 1 : -1;
  const projectName = argv.find((arg, index) =>
    !arg.startsWith("--") && index !== packageManagerValueIndex
  );

  if (options.createExistingTargetDir && projectName) {
    await fs.ensureDir(path.join(cwd, projectName));
  }
  if (options.savedState && projectName) {
    await fs.ensureDir(path.join(cwd, projectName));
    await fs.outputJson(
      path.join(cwd, ".authenik8", `${projectName}.json`),
      { ...options.savedState, projectName },
    );
  }

  const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.join(" "));
  });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit:${exitCode}`);
    }) as never);

  process.chdir(cwd);
  process.argv = ["node", "src/bin/index.ts", ...argv];

  try {
    vi.resetModules();
    await import("../../src/bin/index.js");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("process.exit:")) {
      throw error;
    }
  } finally {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    process.argv = previousArgv;
    process.chdir(previousCwd);

    for (const listener of process.listeners("SIGINT")) {
      if (!previousSigintListeners.includes(listener)) {
        process.removeListener("SIGINT", listener);
      }
    }
  }

  return {
    exitCode,
    logs,
    errors,
    cwd,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  const tempDirs = await fs.readdir(os.tmpdir());

  await Promise.all(
    tempDirs
      .filter((name) => name.startsWith("authenik8-cli-"))
      .map((name) => fs.remove(path.join(os.tmpdir(), name))),
  );
});

describe("CLI", () => {
  it("fails fast when no project name is provided", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const result = await runCliSubprocess(["--production-ready"], cwd);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("A project name is required");
    expect(mockModules.runPrompts).not.toHaveBeenCalled();
  });

  it("prints help without requiring a project name or starting generation", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const result = await runCliSubprocess(["--help"], cwd);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("AUTHENIK8");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).not.toContain("Engine ready");
    expect(mockModules.runPrompts).not.toHaveBeenCalled();
    expect(mockModules.createProject).not.toHaveBeenCalled();
  });

  it("generates a real project non-interactively without reading stdin", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const result = await runCliSubprocess([
      "ci-auth-app",
      "--yes",
      "--preset",
      "auth-oauth",
      "--database",
      "sqlite",
      "--oauth",
      "github",
      "--no-git",
      "--no-install",
    ], cwd);

    expect(result.code).toBe(0);
    const targetDir = path.join(cwd, "ci-auth-app");
    const manifest = await fs.readJson(path.join(targetDir, "authenik8.json"));
    expect(manifest).toMatchObject({
      projectName: "ci-auth-app",
      preset: "auth-oauth",
      packageManager: "npm",
      database: "sqlite",
      features: { prisma: true, oauthProviders: ["github"], pm2: false },
    });
    const env = await fs.readFile(path.join(targetDir, ".env"), "utf8");
    expect(env).toContain("GITHUB_CLIENT_ID");
    expect(env).not.toContain("GOOGLE_CLIENT_ID");
  });

  it("rejects an incomplete non-interactive contract before creating a destination", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const result = await runCliSubprocess([
      "invalid-app",
      "--yes",
      "--preset",
      "auth-oauth",
      "--database",
      "sqlite",
      "--no-oauth",
      "--no-install",
    ], cwd);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("requires --oauth");
    expect(await fs.pathExists(path.join(cwd, "invalid-app"))).toBe(false);
  });

  it("reports an existing target directory before running prompts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    await fs.ensureDir(path.join(cwd, "demo-app"));
    const result = await runCliSubprocess(["demo-app"], cwd);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Directory "demo-app" already exists.');
    expect(mockModules.runPrompts).not.toHaveBeenCalled();
  });

  it("runs the common base-template flow without crashing", async () => {
    const result = await runCli(["demo-app"]);

    expect(result.exitCode).toBeUndefined();
    expect(mockModules.runPrompts).toHaveBeenCalledTimes(1);
    expect(mockModules.createProject).toHaveBeenCalledTimes(1);
    expect(mockModules.configurePrisma).toHaveBeenCalledTimes(1);
    expect(mockModules.configureGeneratedReadme).toHaveBeenCalledWith(
      expect.any(String),
      "npm",
    );
    expect(mockModules.installDependencies).toHaveBeenCalledTimes(1);
    expect(mockModules.installDependencies).toHaveBeenCalledWith(expect.any(String), "npm");
    expect(mockModules.runPostGenerationDoctor).toHaveBeenCalledWith(
      expect.any(String),
      true,
    );
    expect(mockModules.printSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "demo-app",
        authMode: "base",
        usePrisma: true,
      }),
      false,
      expect.any(Boolean),
      expect.any(Boolean),
    );
    expect(result.errors).toHaveLength(0);
  });

  it("can scaffold without installing dependencies", async () => {
    const result = await runCli(["demo-app", "--no-install"]);

    expect(result.exitCode).toBeUndefined();
    expect(mockModules.configurePackageJson).toHaveBeenCalledTimes(1);
    expect(mockModules.installDependencies).not.toHaveBeenCalled();
    expect(mockModules.runPostGenerationDoctor).toHaveBeenCalledWith(
      expect.any(String),
      false,
    );
    expect(mockModules.printSummary).toHaveBeenCalledWith(
      expect.objectContaining({ installDeps: false }),
      false,
      expect.any(Boolean),
      expect.any(Boolean),
    );
  });

  it("runs a complete non-interactive flow and writes its project contract", async () => {
    const result = await runCli([
      "demo-app",
      "--yes",
      "--preset",
      "auth-oauth",
      "--database",
      "postgresql",
      "--oauth",
      "github",
      "--no-git",
      "--no-install",
    ]);

    expect(result.exitCode).toBeUndefined();
    expect(mockModules.runPrompts).not.toHaveBeenCalled();
    expect(mockModules.createProject).toHaveBeenCalledTimes(1);
    expect(mockModules.writeProjectManifest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        projectName: "demo-app",
        preset: "auth-oauth",
        packageManager: "npm",
        runtime: "node",
        database: "postgresql",
        usePrisma: true,
        oauthProviders: ["github"],
        productionReady: false,
      }),
    );
    expect(mockModules.installDependencies).not.toHaveBeenCalled();
    expect(mockModules.initGit).not.toHaveBeenCalled();
  });

  it("parses flags around the project name and runs the production auth flow", async () => {
    const result = await runCli(["--production-ready", "demo-auth"], {
      promptAnswers: {
        authMode: "auth",
        usePrisma: false,
        database: "postgresql",
        runtime: "node",
      },
    });

    expect(result.exitCode).toBeUndefined();
    expect(mockModules.installAuth).toHaveBeenCalledTimes(1);
    expect(mockModules.configureProduction).toHaveBeenCalledTimes(1);
    expect(mockModules.appendProductionReadme).toHaveBeenCalledTimes(1);
    expect(mockModules.printSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "demo-auth",
        authMode: "auth",
        usePrisma: true,
        database: "postgresql",
      }),
      true,
      expect.any(Boolean),
      expect.any(Boolean),
    );
    expect(result.logs.join("\n")).toContain("require Prisma");
  });

  it("passes an explicit package manager through the Express flow", async () => {
    mockModules.installDependencies.mockResolvedValueOnce({
      packageManager: "pnpm",
      durationMs: 800,
    });
    const result = await runCli(["--package-manager", "pnpm", "demo-app"]);

    expect(result.exitCode).toBeUndefined();
    expect(mockModules.installDependencies).toHaveBeenCalledWith(expect.any(String), "pnpm");
    expect(mockModules.printSummary).toHaveBeenCalledWith(
      expect.objectContaining({ packageManager: "pnpm" }),
      false,
      expect.any(Boolean),
      expect.any(Boolean),
    );
  });

  it("preserves production-ready configuration when resuming", async () => {
    const result = await runCli(["demo-auth", "--resume"], {
      savedState: {
        step: "prisma-configured",
        framework: "Express",
        authMode: "auth",
        usePrisma: true,
        database: "sqlite",
        useGit: false,
        runtime: "node",
        installDeps: false,
        packageManager: "npm",
        productionReady: true,
      },
    });

    expect(result.exitCode).toBeUndefined();
    expect(mockModules.runPrompts).not.toHaveBeenCalled();
    expect(mockModules.configureProduction).toHaveBeenCalledTimes(1);
    expect(mockModules.appendProductionReadme).toHaveBeenCalledTimes(1);
    expect(mockModules.printSummary).toHaveBeenCalledWith(
      expect.objectContaining({ productionReady: true }),
      true,
      expect.any(Boolean),
      expect.any(Boolean),
    );
  });

  it("rejects unsupported package managers before prompting", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const result = await runCliSubprocess(["demo-app", "--package-manager", "yarn"], cwd);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unsupported package manager");
  });

  it("prints the package version without requiring a project name", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const result = await runCliSubprocess(["--version"], cwd);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
