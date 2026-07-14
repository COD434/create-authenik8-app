import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import {
  createProjectController,
  deleteProjectController,
  getProjectController,
  listProjectsController,
  updateProjectController,
} from "./project.controller.js";

export const projectRoutes = Router();
projectRoutes.use(authenticate);
projectRoutes.get("/", listProjectsController);
projectRoutes.post("/", requireAllowedOrigin, createProjectController);
projectRoutes.get("/:id", getProjectController);
projectRoutes.patch("/:id", requireAllowedOrigin, updateProjectController);
projectRoutes.delete("/:id", requireAllowedOrigin, deleteProjectController);
