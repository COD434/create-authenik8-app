import { Router, type Request } from "express";
import { identifierSchema } from "@authenik8/contracts";
import { authenticate } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import { projectRepository } from "./project.repository.js";
import { requireProjectAccess } from "./project.policy.js";
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

const loadProject = (req: Request) =>
  projectRepository.findById(identifierSchema.parse(req.params.id));

projectRoutes.get("/", listProjectsController);
projectRoutes.post("/", requireAllowedOrigin, requireCsrf, createProjectController);
// Declarative resource policy (A8 policy DSL): the compiled middleware
// enforces ownership before the controller; the service re-checks.
projectRoutes.get("/:id", requireProjectAccess("read", loadProject), getProjectController);
projectRoutes.patch(
  "/:id",
  requireAllowedOrigin,
  requireCsrf,
  requireProjectAccess("write", loadProject),
  updateProjectController,
);
projectRoutes.delete(
  "/:id",
  requireAllowedOrigin,
  requireCsrf,
  requireProjectAccess("write", loadProject),
  deleteProjectController,
);
