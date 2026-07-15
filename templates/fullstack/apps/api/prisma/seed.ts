import bcrypt from "bcryptjs";
import { ProjectStatus, Role } from "@prisma/client";
import { prisma } from "../src/config/prisma.js";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN, status: "ACTIVE" },
    create: {
      email,
      name: "Workspace Admin",
      passwordHash: await bcrypt.hash(password, 12),
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  const existingProject = await prisma.project.findFirst({ where: { ownerId: admin.id } });
  if (!existingProject) {
    await prisma.project.create({
      data: {
        name: "Launch workspace",
        description: "Your first complete Authenik8 feature slice.",
        status: ProjectStatus.ACTIVE,
        ownerId: admin.id,
      },
    });
  }

  console.log(`Seeded administrator ${email}`);
}

main()
  .finally(() => prisma.$disconnect());
