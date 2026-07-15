import express from "express";
import { adminMiddleware, authMiddleware } from "../middleware/auth.middleware";
import { protectedController } from "../controllers/protected.controller";

const router = express.Router();

router.get("/protected", authMiddleware, protectedController.protected);
router.get("/admin/sessions/:userId", adminMiddleware, protectedController.listSessions);
router.delete("/admin/sessions/:userId/:sessionId", adminMiddleware, protectedController.revokeSession);
router.delete("/admin/sessions/:userId", adminMiddleware, protectedController.revokeAllSessions);

export default router;
