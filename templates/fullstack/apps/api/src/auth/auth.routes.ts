import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireCsrf } from "../middleware/csrf.js";
import { requireAllowedOrigin } from "../middleware/origin.js";
import {
  csrfTokenController,
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

authRoutes.get("/csrf", csrfTokenController);
authRoutes.post("/register", requireAllowedOrigin, requireCsrf, registerController);
// These routes are mounted after authenik8-core's global Redis-backed limiter.
// codeql[js/missing-rate-limiting]
authRoutes.post("/login", requireAllowedOrigin, requireCsrf, loginController);
authRoutes.post("/refresh", requireAllowedOrigin, requireCsrf, refreshController);
authRoutes.post("/logout", requireAllowedOrigin, requireCsrf, logoutController);
// codeql[js/missing-rate-limiting]
authRoutes.get("/me", authenticate, meController);
authRoutes.post("/forgot-password", requireAllowedOrigin, requireCsrf, forgotPasswordController);
authRoutes.post("/reset-password", requireAllowedOrigin, requireCsrf, resetPasswordController);
// codeql[js/missing-rate-limiting]
authRoutes.post("/verify-email", requireAllowedOrigin, requireCsrf, verifyEmailController);
// codeql[js/missing-rate-limiting]
authRoutes.post("/resend-verification", requireAllowedOrigin, requireCsrf, authenticate, resendVerificationController);

// codeql[js/missing-rate-limiting]
authRoutes.get("/oauth/:provider", oauthRedirectController);
// codeql[js/missing-rate-limiting]
authRoutes.post("/oauth/:provider/link-intent", requireAllowedOrigin, requireCsrf, authenticate, oauthLinkIntentController);
// codeql[js/missing-rate-limiting]
authRoutes.get("/oauth/:provider/link", oauthLinkRedirectController);
// codeql[js/missing-rate-limiting]
authRoutes.get("/oauth/:provider/callback", oauthCallbackController);
// codeql[js/missing-rate-limiting]
authRoutes.post("/oauth/exchange", requireAllowedOrigin, requireCsrf, oauthExchangeController);
