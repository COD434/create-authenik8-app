import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireAllowedOrigin } from "../middleware/origin.js";
import {
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  oauthCallbackController,
  oauthExchangeController,
  oauthLinkIntentController,
  oauthLinkRedirectController,
  oauthRedirectController,
  refreshController,
  registerController,
  resendVerificationController,
  resetPasswordController,
  verifyEmailController,
} from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/register", requireAllowedOrigin, registerController);
authRoutes.post("/login", requireAllowedOrigin, loginController);
authRoutes.post("/refresh", requireAllowedOrigin, refreshController);
authRoutes.post("/logout", requireAllowedOrigin, logoutController);
authRoutes.get("/me", authenticate, meController);
authRoutes.post("/forgot-password", requireAllowedOrigin, forgotPasswordController);
authRoutes.post("/reset-password", requireAllowedOrigin, resetPasswordController);
authRoutes.post("/verify-email", requireAllowedOrigin, verifyEmailController);
authRoutes.post("/resend-verification", requireAllowedOrigin, authenticate, resendVerificationController);

authRoutes.get("/oauth/:provider", oauthRedirectController);
authRoutes.post("/oauth/:provider/link-intent", requireAllowedOrigin, authenticate, oauthLinkIntentController);
authRoutes.get("/oauth/:provider/link", oauthLinkRedirectController);
authRoutes.get("/oauth/:provider/callback", oauthCallbackController);
authRoutes.post("/oauth/exchange", requireAllowedOrigin, oauthExchangeController);
