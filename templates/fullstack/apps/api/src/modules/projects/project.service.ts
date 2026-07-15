import { projectCreateSchema, projectUpdateSchema } from "@authenik8/contracts";
import type { Project } from "@prisma/client";
import { AppError } from "../../utils/http.js";
import { canReadProject, canWriteProject, projectListScope } from "./project.policy.js";
import { projectRepository } from "./project.repository.js";

type Actor = { userId: string; role: "USER" | "ADMIN" };

function present(project: Project) {
  return { ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() };
}

async function authorizedProject(actor: Actor, id: string, write = false) {
  const project = await projectRepository.findById(id);
  const allowed = project && (write ? canWriteProject(actor, project) : canReadProject(actor, project));
  if (!project || !allowed) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  return project;
}

export async function listProjects(actor: Actor) {
  return (await projectRepository.list(projectListScope(actor))).map(present);
}

export async function getProject(actor: Actor, id: string) {
  return present(await authorizedProject(actor, id));
}

export async function createProject(actor: Actor, body: unknown) {
  const input = projectCreateSchema.parse(body);
  return present(await projectRepository.create({ ...input, ownerId: actor.userId }));
}

export async function updateProject(actor: Actor, id: string, body: unknown) {
  await authorizedProject(actor, id, true);
  return present(await projectRepository.update(id, projectUpdateSchema.parse(body)));
}

export async function deleteProject(actor: Actor, id: string) {
  await authorizedProject(actor, id, true);
  await projectRepository.remove(id);
}
