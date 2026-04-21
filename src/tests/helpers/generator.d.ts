import type { CliState } from "../../src/lib/types.js";
type TemplateKind = "base" | "auth" | "auth-oauth";
export type GeneratedProject = {
    rootDir: string;
    targetDir: string;
    state: CliState;
    cleanup: () => Promise<void>;
    hashLib?: string;
};
export type GenerateProjectOptions = {
    template: TemplateKind;
    database?: "sqlite" | "postgresql";
    usePrisma?: boolean;
    productionRuntime?: "node" | "bun";
    hashLib?: "argon2" | "bcryptjs";
};
export declare function generateProjectFixture(options: GenerateProjectOptions): Promise<GeneratedProject>;
export declare function collectProjectTree(rootDir: string): Promise<string[]>;
export declare function readProjectFiles(rootDir: string, relativePaths: string[]): Promise<Record<string, string>>;
export declare function installGeneratedAppStubs(targetDir: string): Promise<void>;
export declare function runGeneratedServerSmoke(targetDir: string, entryPath: string): Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
}>;
export {};
//# sourceMappingURL=generator.d.ts.map