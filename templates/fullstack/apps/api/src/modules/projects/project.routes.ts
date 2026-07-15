import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import {
  createProjectController,
  deleteProjectController,
  getProjectController,
  listProjectsController,
  updateProjectController,
} from "./project.controller.js";

export const projectRoutes = Router();
// authenik8-core's global Redis-backed limiter runs before this router.
// codeql[js/missing-rate-limiting]
projectRoutes.use(authenticate);
projectRoutes.get("/", listProjectsController);
projectRoutes.post("/", requireAllowedOrigin, requireCsrf, createProjectController);
projectRoutes.get("/:id", getProjectController);
projectRoutes.patch("/:id", requireAllowedOrigin, requireCsrf, updateProjectController);
projectRoutes.delete("/:id", requireAllowedOrigin, requireCsrf, deleteProjectController);
