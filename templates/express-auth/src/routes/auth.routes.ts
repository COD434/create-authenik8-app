import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller";

export const createAuthRoutes = (auth: any) => {
  const router = Router();
  const controller = createAuthController(auth);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/refresh", controller.refresh);

  return router;
};
