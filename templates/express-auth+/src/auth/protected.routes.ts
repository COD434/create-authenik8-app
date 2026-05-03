import express from "express";
import { adminMiddleware } from "./auth.middleware";
import { protectedController } from "./protected.controller";

const router = express.Router();

router.get("/protected", adminMiddleware, protectedController.protected);
router.get("/admin/sessions/:userId", adminMiddleware, protectedController.listSessions);
router.delete("/admin/sessions/:userId/:sessionId", adminMiddleware, protectedController.revokeSession);
router.delete("/admin/sessions/:userId", adminMiddleware, protectedController.revokeAllSessions);

export default router;
