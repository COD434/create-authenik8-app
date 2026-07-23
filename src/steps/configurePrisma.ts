import fs from "fs-extra";
import path from "path";
import type { CliState } from "../lib/types.js";
import { PRISMA_VERSION } from "../lib/constants.js";
import { exitForInterrupt } from "../lib/process.js";
<<<<<<< HEAD
import {
  configureOAuthEnvironmentFiles,
  oauthProviders,
  supportedOAuthProviders,
  type OAuthProvider,
} from "../lib/oauth.js";
=======
>>>>>>> main
import { configureSigningKeys } from "../utils/jwk.js";

const oauthIdentityModel = `

model IdentityProvider {
  id         String @id @default(uuid())
  userId     String
  provider   String
  providerId String

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([provider, providerId])
  @@unique([userId, provider])
}
`;

function addOAuthIdentityModels(schema: string): string {
  return schema
    .replace(/^  password  String$/m, "  password  String?")
    .replace(
      /^  sessions  Session\[\]$/m,
      "  sessions          Session[]\n  identityProviders IdentityProvider[]",
    )
    .replace(/\s*$/, oauthIdentityModel);
}

async function removeUnusedPostgresService(targetDir: string): Promise<void> {
  const composePath = path.join(targetDir, "docker-compose.yml");
  if (!(await fs.pathExists(composePath))) return;

  const compose = (await fs.readFile(composePath, "utf-8")).replace(/\r\n/g, "\n");
  const redisOnly = compose
    .replace(/\n  postgres:\n[\s\S]*?(?=\nvolumes:\n)/, "\n")
    .replace(/\n  postgres-data:\s*(?=\n|$)/, "");
  await fs.writeFile(composePath, redisOnly);
}
<<<<<<< HEAD

function selectedOAuthProviders(state: CliState): OAuthProvider[] {
  if (state.authMode !== "auth-oauth") return [];

  const selected = supportedOAuthProviders(state.oauthProviders);
  return selected.length ? selected : [...oauthProviders];
}
=======
>>>>>>> main

export async function configurePrisma(
  state: CliState,
  targetDir: string,
  templateRoot: string
): Promise<void> {
  if (state.authMode === "fullstack") {
    await configureSigningKeys(targetDir, state.projectName);
    return;
  }

  const pkgPath = path.join(targetDir, "package.json");
  const pkg = await fs.readJson(pkgPath);

  if (state.database !== "postgresql") {
    await removeUnusedPostgresService(targetDir);
  }

  pkg.dependencies = {
    ...pkg.dependencies,
    ioredis: "^5.8.1",
<<<<<<< HEAD
  };
  pkg.devDependencies = {
    ...pkg.devDependencies,
    "ioredis-mock": "8.13.1",
=======
>>>>>>> main
  };

  if (state.usePrisma) {
    try {
      const dbType = state.database === "postgresql" ? "postgresql" : "sqlite";
      const prismaTemplatePath = path.join(templateRoot, `prisma/${dbType}`);

      await fs.copy(
        path.join(prismaTemplatePath, "schema.prisma"),
        path.join(targetDir, "prisma/schema.prisma")
      );

      if (state.authMode === "auth-oauth") {
        const schemaPath = path.join(targetDir, "prisma/schema.prisma");
        const schema = await fs.readFile(schemaPath, "utf-8");
        await fs.writeFile(schemaPath, addOAuthIdentityModels(schema));
      }

      await fs.copy(
        path.join(prismaTemplatePath, "prisma.config.ts"),
        path.join(targetDir, "prisma.config.ts")
      );

      await fs.copy(
        path.join(prismaTemplatePath, "client.ts"),
        path.join(targetDir, "src/prisma/client.ts")
      );

      await fs.copy(
        path.join(prismaTemplatePath, ".env.example"),
        path.join(targetDir, ".env")
      );
      await fs.copy(
        path.join(prismaTemplatePath, ".env.example"),
        path.join(targetDir, ".env.example")
      );

      await configureOAuthEnvironmentFiles(targetDir, selectedOAuthProviders(state));

      pkg.dependencies = {
        ...pkg.dependencies,
        "@prisma/client": PRISMA_VERSION,
        [dbType === "postgresql"
          ? "@prisma/adapter-pg"
<<<<<<< HEAD
          : "@prisma/adapter-libsql"]: PRISMA_VERSION,
      };
      delete pkg.dependencies[
        dbType === "postgresql"
          ? "@prisma/adapter-libsql"
          : "@prisma/adapter-pg"
      ];
      delete pkg.dependencies["@prisma/adapter-better-sqlite3"];
=======
          : "@prisma/adapter-better-sqlite3"]: PRISMA_VERSION,
      };
      delete pkg.dependencies[
        dbType === "postgresql"
          ? "@prisma/adapter-better-sqlite3"
          : "@prisma/adapter-pg"
      ];
>>>>>>> main

      pkg.devDependencies = {
        ...pkg.devDependencies,
        prisma: PRISMA_VERSION,
      };

      pkg.engines = { ...pkg.engines, node: "^20.19 || ^22.12 || >=24" };

      pkg.scripts = {
        ...pkg.scripts,
        "db:migrate": "prisma db push && prisma generate",
        "prisma:generate": "prisma generate",
<<<<<<< HEAD
        "prisma:migrate": "prisma db push && prisma generate",
=======
        "prisma:migrate": "prisma migrate dev && prisma generate",
>>>>>>> main
      };
    } catch (err) {
      await exitForInterrupt(err);
      throw err;
    }
  } else {
    pkg.engines = { ...pkg.engines, node: "^20.19 || ^22.12 || >=24" };
    const templateEnvPath = path.join(targetDir, "src/.env.example");
    if (await fs.pathExists(templateEnvPath)) {
      await fs.move(templateEnvPath, path.join(targetDir, ".env.example"), { overwrite: true });
      await fs.copy(path.join(targetDir, ".env.example"), path.join(targetDir, ".env"));
    }

    const readmePath = path.join(targetDir, "README.md");
    if (await fs.pathExists(readmePath)) {
      const readme = (await fs.readFile(readmePath, "utf-8"))
        .replace(/\r\n/g, "\n")
<<<<<<< HEAD
        .replaceAll("npm run db:migrate\n", "")
=======
>>>>>>> main
        .replaceAll("npm run prisma:migrate\n", "")
        .replace(/^DATABASE_URL=.*\n/gm, "")
        .replace(/^- `DATABASE_URL`:.*\n/gm, "")
        .replace(/^`Prisma Client did not initialize`:.*\n?/gm, "")
        .replace(/^`DATABASE_URL is wrong`:.*\n?/gm, "")
        .replace(", run `npx prisma migrate deploy` for production databases", "");
      await fs.writeFile(readmePath, readme);
    }
  }

  await fs.writeJson(pkgPath, pkg, { spaces: 2 });
  await configureSigningKeys(targetDir, state.projectName);
}
