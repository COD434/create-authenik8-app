import { asyncHandler } from "../../utils/http.js";
import { identifierSchema } from "@authenik8/contracts";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "./project.service.js";

const actor = (user: NonNullable<Express.Request["user"]>) => ({ userId: user.userId, role: user.role });

export const listProjectsController = asyncHandler(async (req, res) => {
  res.json({ projects: await listProjects(actor(req.user!)) });
});
export const getProjectController = asyncHandler(async (req, res) => {
  res.json({ project: await getProject(actor(req.user!), identifierSchema.parse(req.params.id)) });
});
export const createProjectController = asyncHandler(async (req, res) => {
  res.status(201).json({ project: await createProject(actor(req.user!), req.body) });
});
export const updateProjectController = asyncHandler(async (req, res) => {
  res.json({ project: await updateProject(actor(req.user!), identifierSchema.parse(req.params.id), req.body) });
});
export const deleteProjectController = asyncHandler(async (req, res) => {
  await deleteProject(actor(req.user!), identifierSchema.parse(req.params.id));
  res.status(204).send();
});
