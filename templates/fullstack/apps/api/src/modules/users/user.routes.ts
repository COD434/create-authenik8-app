import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireAllowedOrigin } from "../../middleware/origin.js";
import {
  changePasswordController,
  providersController,
  revokeSessionController,
  sessionsController,
  updateProfileController,
} from "./user.controller.js";

export const userRoutes = Router();
userRoutes.use(authenticate);
userRoutes.patch("/profile", requireAllowedOrigin, updateProfileController);
userRoutes.put("/password", requireAllowedOrigin, changePasswordController);
userRoutes.get("/sessions", sessionsController);
userRoutes.delete("/sessions/:id", requireAllowedOrigin, revokeSessionController);
userRoutes.get("/providers", providersController);
