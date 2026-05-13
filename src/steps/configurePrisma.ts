import fs from "fs-extra";
import path from "path";
import type { CliState } from "../lib/types.js";
import { spinner } from "../lib/ui.js";
import { exitForInterrupt } from "../lib/process.js";

export async function configurePrisma(
  state: CliState,
  targetDir: string,
  templateRoot: string
): Promise<void> {
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = await fs.readJson(pkgPath);

  pkg.dependencies = {
    ...pkg.dependencies,
    ioredis: "^5.8.1",
  };

  if (state.usePrisma) {
    spinner.start("Adding Prisma setup...");

    try {
      const dbType = state.database === "postgresql" ? "postgresql" : "sqlite";
      const prismaTemplatePath = path.join(templateRoot, `prisma/${dbType}`);

      await fs.copy(
        path.join(prismaTemplatePath, "schema.prisma"),
        path.join(targetDir, "prisma/schema.prisma")
      );

      await fs.copy(
        path.join(prismaTemplatePath, ".env.example"),
        path.join(targetDir, ".env")
      );

      const providers = state.authMode === "auth-oauth"
        ? (state.oauthProviders?.length ? state.oauthProviders : ["google", "github"])
        : [];
      if (providers.length > 0) {
        await fs.appendFile(
          path.join(targetDir, ".env"),
          `\nAUTHENIK8_OAUTH_PROVIDERS="${providers.join(",")}"\n`
        );
      }

      pkg.dependencies = {
        ...pkg.dependencies,
        "@prisma/client": "5.22.0",
      };

      pkg.devDependencies = {
        ...pkg.devDependencies,
        prisma: "5.22.0",
      };

      pkg.scripts = {
        ...pkg.scripts,
        "prisma:generate": "prisma generate",
        "prisma:migrate": "prisma migrate dev",
      };

      spinner.succeed(`Prisma (${dbType}) configured`);
    } catch (err) {
      spinner.fail("Failed to setup Prisma");
      exitForInterrupt(err);
    }
  }

  await fs.writeJson(pkgPath, pkg, { spaces: 2 });
}
