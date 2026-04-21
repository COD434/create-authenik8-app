import { describe, expect, it } from "vitest";

import {
  collectProjectTree,
  generateProjectFixture,
  readProjectFiles,
} from "../helpers/generator.js";

describe("generator snapshots", () => {
  it.each([
    {
      name: "express-base",
      options: {
        template: "base" as const,
        database: "sqlite" as const,
      },
      keyFiles: ["app.ts", "routes/base.routes.ts", "src/server.ts", "prisma/schema.prisma"],
    },
    {
      name: "express-auth",
      options: {
        template: "auth" as const,
        database: "postgresql" as const,
        hashLib: "bcryptjs" as const,
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
        template: "auth-oauth" as const,
        database: "sqlite" as const,
        hashLib: "bcryptjs" as const,
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
  ])("$name folder tree and key files match the snapshot", async ({ options, keyFiles }) => {
    const project = await generateProjectFixture(options);

    try {
	    const rawTree = await collectProjectTree(project.targetDir);

      
      const files = await readProjectFiles(project.targetDir, keyFiles);


	    const stableTree = rawTree
          .filter((path) =>
		   !path.includes("node_modules") && 
          !path.endsWith(".env") && 
          !path.endsWith(".env.example") && 
          !path.includes("package-lock.json")
		 ).sort();
	const filesContent = await readProjectFiles(project.targetDir, keyFiles);

	const snapshotData = {
        template: options.template,
        tree: stableTree,
        keyFiles: filesContent,
      };

      expect(snapshotData).toMatchSnapshot();
    } finally {
      await project.cleanup();
    }
  });
});
