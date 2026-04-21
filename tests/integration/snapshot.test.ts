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
      files: ["app.ts", "routes/base.routes.ts", "src/server.ts", "prisma/schema.prisma"],
    },
    {
      name: "express-auth",
      options: {
        template: "auth" as const,
        database: "postgresql" as const,
        hashLib: "bcryptjs" as const,
      },
      files: [
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
      files: [
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
      expect({
        tree: await collectProjectTree(project.targetDir),
        files: await readProjectFiles(project.targetDir, files),
      }).toMatchSnapshot();
    } finally {
      await project.cleanup();
    }
  });
});
