import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import {
  changePasswordController,
  profileController,
  providersController,
  revokeOtherSessionsController,
  revokeSessionController,
  sessionsController,
  unlinkProviderController,
  updateProfileController,
} from "./user.controller.js";

export const userRoutes = Router();
// authenik8-core's global Redis-backed limiter runs before this router.
// codeql[js/missing-rate-limiting]
userRoutes.use(authenticate);
userRoutes.get("/profile", profileController);
userRoutes.patch("/profile", requireAllowedOrigin, requireCsrf, updateProfileController);
userRoutes.put("/password", requireAllowedOrigin, requireCsrf, changePasswordController);
userRoutes.get("/sessions", sessionsController);
userRoutes.delete("/sessions", requireAllowedOrigin, requireCsrf, revokeOtherSessionsController);
userRoutes.delete("/sessions/:id", requireAllowedOrigin, requireCsrf, revokeSessionController);
userRoutes.get("/providers", providersController);
userRoutes.delete("/providers/:provider", requireAllowedOrigin, requireCsrf, unlinkProviderController);
