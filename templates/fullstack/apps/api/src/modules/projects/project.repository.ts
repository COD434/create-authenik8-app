import type { Prisma, Project } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export const projectRepository = {
  list(where: Prisma.ProjectWhereInput): Promise<Project[]> {
    return prisma.project.findMany({ where, orderBy: { updatedAt: "desc" } });
  },
  findById(id: string): Promise<Project | null> {
    return prisma.project.findUnique({ where: { id } });
  },
  create(data: Prisma.ProjectUncheckedCreateInput): Promise<Project> {
    return prisma.project.create({ data });
  },
  update(id: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    return prisma.project.update({ where: { id }, data });
  },
  remove(id: string): Promise<Project> {
    return prisma.project.delete({ where: { id } });
  },
};
