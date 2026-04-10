import { Router } from "express";

export const createProtectedRoutes = (auth: any) => {
  const router = Router();

  router.get("/protected", auth.requireAdmin, (req, res) => {
    res.json({ message: "Protected route" });
  });

  return router;
};
