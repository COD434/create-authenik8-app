import { Router } from "express";
import { createProtectedController } from "../controllers/protected.controller";

export const createProtectedRoutes = (auth: any) => {
  const router = Router();
  const controller = createProtectedController();

  router.get("/protected", auth.requireAdmin, controller.protected);
  router.get("/admin/sessions/:userId", auth.requireAdmin, controller.listSessions);
  router.delete("/admin/sessions/:userId/:sessionId", auth.requireAdmin, controller.revokeSession);
  router.delete("/admin/sessions/:userId", auth.requireAdmin, controller.revokeAllSessions);

  return router;
};
