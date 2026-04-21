import { spawn } from "child_process";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
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
        showBootLogo: vi.fn(async () => { }),
        renderStep: vi.fn(),
        runPrompts: vi.fn(async () => state.promptAnswers),
        createProject: vi.fn(async () => { }),
        configurePackageJson: vi.fn(),
        installAuth: vi.fn(async () => "bcryptjs"),
        configurePrisma: vi.fn(async () => { }),
        installDependencies: vi.fn(async () => { }),
        detectPackageManager: vi.fn(() => "npm"),
        configureProduction: vi.fn(async () => { }),
        initGit: vi.fn(async () => { }),
        appendProductionReadme: vi.fn(),
        resolveRuntime: vi.fn((runtime) => runtime ?? "node"),
        printSummary: vi.fn(),
        spinner: {
            start: vi.fn(),
            stop: vi.fn(),
            succeed: vi.fn(),
            fail: vi.fn(),
            text: "",
        },
    };
    return state;
});
vi.mock("../../src/lib/ui.js", () => ({
    showBootLogo: mockModules.showBootLogo,
    renderStep: mockModules.renderStep,
    spinner: mockModules.spinner,
}));
vi.mock("../../src/steps/prompts.js", () => ({
    runPrompts: mockModules.runPrompts,
}));
vi.mock("../../src/steps/createProject.js", () => ({
    createProject: mockModules.createProject,
    configurePackageJson: mockModules.configurePackageJson,
}));
vi.mock("../../src/steps/installAuth.js", () => ({
    installAuth: mockModules.installAuth,
}));
vi.mock("../../src/steps/configurePrisma.js", () => ({
    configurePrisma: mockModules.configurePrisma,
}));
vi.mock("../../src/steps/installDeps.js", () => ({
    installDependencies: mockModules.installDependencies,
    detectPackageManager: mockModules.detectPackageManager,
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const tsxLoaderPath = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
function normalizeText(value) {
    return value.replace(/\r\n/g, "\n").trim();
}
async function runCliSubprocess(argv, cwd) {
    return await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", tsxLoaderPath, path.join(repoRoot, "src/index.ts"), ...argv], {
            cwd,
            env: {
                ...process.env,
                FORCE_COLOR: "0",
                CI: "true",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            resolve({
                code,
                stdout: normalizeText(stdout),
                stderr: normalizeText(stderr),
            });
        });
    });
}
async function runCli(argv, options = {}) {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
    const previousArgv = [...process.argv];
    const previousCwd = process.cwd();
    const previousSigintListeners = process.listeners("SIGINT");
    const logs = [];
    const errors = [];
    let exitCode;
    mockModules.promptAnswers = {
        framework: "Express",
        authMode: "base",
        usePrisma: true,
        database: "sqlite",
        useGit: false,
        runtime: "node",
        ...options.promptAnswers,
    };
    const projectName = argv.find((arg) => !arg.startsWith("--"));
    if (options.createExistingTargetDir && projectName) {
        await fs.ensureDir(path.join(cwd, projectName));
    }
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
        logs.push(args.join(" "));
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
        errors.push(args.join(" "));
    });
    const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(((code) => {
        exitCode = code ?? 0;
        throw new Error(`process.exit:${exitCode}`);
    }));
    process.chdir(cwd);
    process.argv = ["node", "src/index.ts", ...argv];
    try {
        vi.resetModules();
        await import("../../src/index.ts");
    }
    catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("process.exit:")) {
            throw error;
        }
    }
    finally {
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
    await Promise.all(tempDirs
        .filter((name) => name.startsWith("authenik8-cli-"))
        .map((name) => fs.remove(path.join(os.tmpdir(), name))));
});
describe("CLI", () => {
    it("fails fast when no project name is provided", async () => {
        const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
        const result = await runCliSubprocess(["--production-ready"], cwd);
        expect(result.code).toBe(1);
        expect(result.stdout).toContain("Please provide a project name");
        expect(mockModules.runPrompts).not.toHaveBeenCalled();
    });
    it("prints help output for --help without starting generation", async () => {
        const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
        const result = await runCliSubprocess(["demo-app", "--help"], cwd);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("Authenik8 CLI");
        expect(result.stdout).toContain("Usage:");
        expect(mockModules.runPrompts).not.toHaveBeenCalled();
        expect(mockModules.createProject).not.toHaveBeenCalled();
    });
    it("reports an existing target directory before running prompts", async () => {
        const cwd = await mkdtemp(path.join(os.tmpdir(), "authenik8-cli-"));
        await fs.ensureDir(path.join(cwd, "demo-app"));
        const result = await runCliSubprocess(["demo-app"], cwd);
        expect(result.code).toBe(1);
        expect(result.stdout).toContain('Directory "demo-app" already exists.');
        expect(mockModules.runPrompts).not.toHaveBeenCalled();
    });
    it("runs the common base-template flow without crashing", async () => {
        const result = await runCli(["demo-app"]);
        expect(result.exitCode).toBeUndefined();
        expect(mockModules.runPrompts).toHaveBeenCalledTimes(1);
        expect(mockModules.createProject).toHaveBeenCalledTimes(1);
        expect(mockModules.configurePrisma).toHaveBeenCalledTimes(1);
        expect(mockModules.installDependencies).toHaveBeenCalledTimes(1);
        expect(mockModules.printSummary).toHaveBeenCalledWith(expect.objectContaining({
            projectName: "demo-app",
            authMode: "base",
            usePrisma: true,
        }), false);
        expect(result.errors).toHaveLength(0);
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
        expect(mockModules.printSummary).toHaveBeenCalledWith(expect.objectContaining({
            projectName: "demo-auth",
            authMode: "auth",
            usePrisma: true,
            database: "postgresql",
        }), true);
        expect(result.logs.join("\n")).toContain("require Prisma");
    });
});
//# sourceMappingURL=cli.test.js.map