import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { generateProjectFixture, readProjectFiles, runGeneratedServerSmoke, } from "../helpers/generator.js";
describe("generator happy paths", () => {
    it("generates the base template with Prisma SQLite wiring", async () => {
        const project = await generateProjectFixture({
            template: "base",
            database: "sqlite",
        });
        try {
            const pkg = await fs.readJson(`${project.targetDir}/package.json`);
            const files = await readProjectFiles(project.targetDir, [
                "app.ts",
                "routes/base.routes.ts",
                "src/server.ts",
                "prisma/schema.prisma",
            ]);
            expect(pkg.scripts.postinstall).toBe("npx prisma@5.22.0 generate");
            expect(pkg.scripts.dev).toContain("npx prisma@5.22.0 generate");
            expect(pkg.dependencies["@prisma/client"]).toBe("5.22.0");
            expect(files["app.ts"]).toContain("app.use(auth.helmet)");
            expect(files["routes/base.routes.ts"]).toContain('router.get("/protected"');
            expect(files["prisma/schema.prisma"]).toContain('provider = "sqlite"');
        }
        finally {
            await project.cleanup();
        }
    });
    it("generates the email/password template with a mocked bcrypt hash module", async () => {
        const project = await generateProjectFixture({
            template: "auth",
            database: "postgresql",
            hashLib: "bcryptjs",
        });
        try {
            const pkg = await fs.readJson(`${project.targetDir}/package.json`);
            const files = await readProjectFiles(project.targetDir, [
                "src/app.ts",
                "src/routes/auth.routes.ts",
                "src/routes/protected.routes.ts",
                "src/utils/hash.ts",
                "prisma/schema.prisma",
            ]);
            expect(project.hashLib).toBe("bcryptjs");
            expect(pkg.dependencies.bcryptjs).toBe("^2.4.3");
            expect(pkg.dependencies.ioredis).toBe("^5.8.1");
            expect(files["src/app.ts"]).toContain('app.use("/auth", createAuthRoutes(auth))');
            expect(files["src/routes/auth.routes.ts"]).toContain('router.post("/register"');
            expect(files["src/utils/hash.ts"]).toContain('import bcrypt from "bcryptjs"');
            expect(files["prisma/schema.prisma"]).toContain('provider = "postgresql"');
        }
        finally {
            await project.cleanup();
        }
    });
    it("generates the OAuth template with production runtime files", async () => {
        const project = await generateProjectFixture({
            template: "auth-oauth",
            database: "sqlite",
            hashLib: "bcryptjs",
            productionRuntime: "node",
        });
        try {
            const pkg = await fs.readJson(`${project.targetDir}/package.json`);
            const files = await readProjectFiles(project.targetDir, [
                "src/server.ts",
                "src/auth/auth.ts",
                "src/auth/oauth.routes.ts",
                "src/auth/password.route.ts",
                "ecosystem.config.js",
            ]);
            expect(pkg.dependencies.pm2).toBe("^5.4.2");
            expect(pkg.dependencies["ts-node"]).toBe("^10.9.2");
            expect(pkg.scripts["pm2:start"]).toBe("npx pm2 start ecosystem.config.js");
            expect(files["src/auth/auth.ts"]).toContain('redirectUri: "http://localhost:3000/auth/google/callback"');
            expect(files["src/auth/oauth.routes.ts"]).toContain('router.get("/github/callback"');
            expect(files["src/auth/password.route.ts"]).toContain("generateRefreshToken");
            expect(files["ecosystem.config.js"]).toContain('interpreter_args: "-r ts-node/register"');
        }
        finally {
            await project.cleanup();
        }
    });
    it.each([
        {
            template: "base",
            entryPath: "src/server.ts",
            expectedOutput: "Server running on http://localhost:3000",
        },
        {
            template: "auth",
            entryPath: "src/server.ts",
            expectedOutput: "Server running on http://localhost:3000",
        },
        {
            template: "auth-oauth",
            entryPath: "src/server.ts",
            expectedOutput: "Auth system running on http://localhost:3000",
        },
    ])("boots the generated $template server with mocked runtime packages", async (scenario) => {
        const project = await generateProjectFixture({
            template: scenario.template,
            hashLib: "bcryptjs",
        });
        try {
            const result = await runGeneratedServerSmoke(project.targetDir, scenario.entryPath);
            expect(result.code).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(scenario.expectedOutput);
        }
        finally {
            await project.cleanup();
        }
    });
});
//# sourceMappingURL=generator.test.js.map