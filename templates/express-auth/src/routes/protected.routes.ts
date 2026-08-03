import { Router } from "express";
import type { Authenik8Instance } from "authenik8-core";
import { createProtectedController } from "../controllers/protected.controller";
import { createAuthMiddleware } from "../middleware/auth.middleware";

export const createProtectedRoutes = (auth: Authenik8Instance) => {
  const router = Router();
  const controller = createProtectedController();
  const requireAuth = createAuthMiddleware(auth);

  router.get("/protected", requireAuth, controller.protected);
  router.get("/admin/sessions/:userId", auth.requireAdmin, controller.listSessions);
  router.delete("/admin/sessions/:userId/:sessionId", auth.requireAdmin, controller.revokeSession);
  router.delete("/admin/sessions/:userId", auth.requireAdmin, controller.revokeAllSessions);

  return router;
};
