import { Router } from "express";
import { authenticate, requireAdmin } from "../../middleware/authenticate.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import { auditController, listUsersController, revokeUserSessionsController, updateUserController } from "./admin.controller.js";

export const adminRoutes = Router();
adminRoutes.use(authenticate, requireAdmin);
adminRoutes.get("/users", listUsersController);
adminRoutes.patch("/users/:id", requireAllowedOrigin, updateUserController);
adminRoutes.delete("/users/:id/sessions", requireAllowedOrigin, revokeUserSessionsController);
adminRoutes.get("/audit", auditController);
