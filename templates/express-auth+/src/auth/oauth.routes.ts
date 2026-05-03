import express from "express";
import { authMiddleware } from "./auth.middleware";
import { oauthController } from "./oauth.controller";

const router = express.Router();

router.get("/google", oauthController.googleRedirect);
router.get("/google/callback", oauthController.googleCallback);
router.get("/github", oauthController.githubRedirect);
router.get("/github/callback", oauthController.githubCallback);
router.get("/google/link", authMiddleware, oauthController.googleLink);
router.get("/github/link", authMiddleware, oauthController.githubLink);

export default router;
