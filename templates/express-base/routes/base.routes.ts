import { Router } from "express";
import type { Authenik8Instance } from "authenik8-core";
import { createBaseController } from "../controllers/base.controller";

export const createBaseRoutes = (auth: Authenik8Instance) => {
  const router = Router();
  const controller = createBaseController(auth);

  router.get("/public", controller.publicRoute);
  router.get("/guest", controller.guest);
  router.get("/protected", auth.requireAuth, controller.protected);
  router.post("/refresh", controller.refresh);

  router.get("/admin", auth.requireAdmin, controller.admin);
  router.get("/admin/sessions/:userId", auth.requireAdmin, controller.listSessions);
  router.delete("/admin/sessions/:userId/:sessionId", auth.requireAdmin, controller.revokeSession);
  router.delete("/admin/sessions/:userId", auth.requireAdmin, controller.revokeAllSessions);

  return router;
};
