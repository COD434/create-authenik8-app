import { describe, expect, it } from "vitest";
import { collectProjectTree, generateProjectFixture, readProjectFiles, } from "../helpers/generator.js";
describe("generator snapshots", () => {
    it.each([
        {
            name: "express-base",
            options: {
                template: "base",
                database: "sqlite",
            },
            keyFiles: ["app.ts", "routes/base.routes.ts", "src/server.ts", "prisma/schema.prisma"],
        },
        {
            name: "express-auth",
            options: {
                template: "auth",
                database: "postgresql",
                hashLib: "bcryptjs",
            },
            keyFiles: [
                "src/app.ts",
                "src/routes/auth.routes.ts",
                "src/routes/protected.routes.ts",
                "src/utils/hash.ts",
                "prisma/schema.prisma",
            ],
        },
        {
            name: "express-auth-oauth",
            options: {
                template: "auth-oauth",
                database: "sqlite",
                hashLib: "bcryptjs",
            },
            keyFiles: [
                "src/server.ts",
                "src/auth/auth.ts",
                "src/auth/password.route.ts",
                "src/auth/oauth.routes.ts",
                "src/auth/protected.routes.ts",
                "src/utils/hash.ts",
                "prisma/schema.prisma",
            ],
        },
    ])("$name folder tree and key files match the snapshot", async ({ options, files }) => {
        const project = await generateProjectFixture(options);
        try {
            const tree = await collectProjectTree(project.targetDir);
            const files = await readProjectFiles(project.targetDir, keyFiles);
            const stableSnapshot = {
                template: options.template,
                tree: tree
                    .filter((path) => !path.includes("node_modules") && !path.includes(".env"))
                    .sort(),
                files: files,
            };
            expect(stableSnapShot).toMatchSnapShot();
        }
        finally {
            await project.cleanup();
        }
    });
});
//# sourceMappingURL=snapshot.test.js.map