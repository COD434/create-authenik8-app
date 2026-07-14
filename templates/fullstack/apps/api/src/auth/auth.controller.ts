import {
  forgotPasswordSchema,
  loginSchema,
  oauthExchangeSchema,
  oauthLinkQuerySchema,
  oauthProviderSchema,
  registerSchema,
  resetPasswordSchema,
  verificationSchema,
} from "@authenik8/contracts";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/http.js";
import { presentUser } from "../modules/users/user.presenter.js";
import { clearRefreshCookie, refreshCookieName, setRefreshCookie } from "./cookies.js";
import {
  completeOAuthCallback,
  consumeLinkIntent,
  createLinkIntent,
  exchangeOAuthCode,
  login,
  oauthProvider,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  revokeRefreshToken,
  rotateSession,
  verifyEmail,
} from "./auth.service.js";
import { prisma } from "../config/prisma.js";

export const registerController = asyncHandler(async (req, res) => {
  res.status(201).json(await register(registerSchema.parse(req.body)));
});

export const loginController = asyncHandler(async (req, res) => {
  const session = await login(loginSchema.parse(req.body), req);
  setRefreshCookie(res, session.refreshToken);
  res.json({ accessToken: session.accessToken, user: session.user });
});

export const refreshController = asyncHandler(async (req, res) => {
  const session = await rotateSession(req.cookies?.[refreshCookieName]);
  setRefreshCookie(res, session.refreshToken);
  res.json({ accessToken: session.accessToken, user: session.user });
});

export const logoutController = asyncHandler(async (req, res) => {
  await revokeRefreshToken(req.cookies?.[refreshCookieName]);
  clearRefreshCookie(res);
  res.json({ message: "Signed out" });
});

export const meController = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  res.json({ user: presentUser(user) });
});

export const forgotPasswordController = asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  res.json(await requestPasswordReset(email));
});

export const resetPasswordController = asyncHandler(async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await resetPassword(input.token, input.password);
  clearRefreshCookie(res);
  res.json({ message: "Password updated" });
});

export const verifyEmailController = asyncHandler(async (req, res) => {
  const { token } = verificationSchema.parse(req.body);
  await verifyEmail(token);
  res.json({ message: "Email verified" });
});

export const resendVerificationController = asyncHandler(async (req, res) => {
  res.json(await resendVerification(req.user!.userId));
});

export const oauthRedirectController = asyncHandler(async (req, res) => {
  await oauthProvider(oauthProviderSchema.parse(req.params.provider)).provider.redirect(req, res);
});

export const oauthLinkIntentController = asyncHandler(async (req, res) => {
  const url = await createLinkIntent(req.user!.userId, oauthProviderSchema.parse(req.params.provider));
  res.json({ url });
});

export const oauthLinkRedirectController = asyncHandler(async (req, res) => {
  const { ticket } = oauthLinkQuerySchema.parse(req.query);
  const userId = await consumeLinkIntent(ticket);
  req.user = { userId, email: "", name: "", role: "USER" };
  await oauthProvider(oauthProviderSchema.parse(req.params.provider)).provider.redirect(req, res, "link");
});

export const oauthCallbackController = asyncHandler(async (req, res) => {
  try {
    const providerName = oauthProviderSchema.parse(req.params.provider);
    const { provider } = oauthProvider(providerName);
    const result = await provider.handleCallback(req);
    const completed = await completeOAuthCallback(providerName, result, req);
    if (completed.linked) {
      res.redirect(`${env.WEB_ORIGIN}/settings/security?linked=${completed.provider}`);
      return;
    }
    res.redirect(`${env.WEB_ORIGIN}/auth/callback?code=${completed.code}`);
  } catch (error) {
    req.log?.warn({ err: error }, "OAuth callback rejected");
    res.redirect(`${env.WEB_ORIGIN}/login?oauthError=1`);
  }
});

export const oauthExchangeController = asyncHandler(async (req, res) => {
  const { code } = oauthExchangeSchema.parse(req.body);
  const session = await exchangeOAuthCode(code);
  setRefreshCookie(res, session.refreshToken);
  res.json({ accessToken: session.accessToken, user: session.user });
});
