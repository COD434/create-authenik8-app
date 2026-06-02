import express from "express";
import { authMiddleware } from "./auth.middleware";
import { oauthController } from "./oauth.controller";

const router = express.Router();

router.get("/google", oauthController.googleRedirect);
router.get("/google/callback", oauthController.googleCallback);
router.get("/google/link", authMiddleware, oauthController.googleLink);

export default router;
