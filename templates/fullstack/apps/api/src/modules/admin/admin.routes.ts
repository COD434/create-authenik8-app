import { Router } from "express";
import { authenticate, requireAdmin } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import { auditController, listUsersController, revokeUserSessionsController, updateUserController } from "./admin.controller.js";

export const adminRoutes = Router();
// authenik8-core's global Redis-backed limiter runs before this router.
// codeql[js/missing-rate-limiting]
adminRoutes.use(authenticate, requireAdmin);
adminRoutes.get("/users", listUsersController);
adminRoutes.patch("/users/:id", requireAllowedOrigin, requireCsrf, updateUserController);
adminRoutes.delete("/users/:id/sessions", requireAllowedOrigin, requireCsrf, revokeUserSessionsController);
adminRoutes.get("/audit", auditController);
