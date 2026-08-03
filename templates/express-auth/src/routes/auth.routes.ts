import { Router } from "express";
import type { Authenik8Instance } from "authenik8-core";
import { createAuthController } from "../controllers/auth.controller";

export const createAuthRoutes = (auth: Authenik8Instance) => {
  const router = Router();
  const controller = createAuthController(auth);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/refresh", controller.refresh);

  return router;
};
