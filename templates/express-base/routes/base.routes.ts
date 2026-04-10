import { Router } from "express";
import { createBaseController } from "../controllers/base.controller";

export const createBaseRoutes = (auth: any) => {
  const router = Router();
  const controller = createBaseController(auth);

  router.get("/public", controller.publicRoute);
  router.get("/guest", controller.guest);
  router.get("/protected", controller.protected);
  router.post("/refresh", controller.refresh);

  router.get("/admin", auth.requireAdmin, controller.admin);

  return router;
};
