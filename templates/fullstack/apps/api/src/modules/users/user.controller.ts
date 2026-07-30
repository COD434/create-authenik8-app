import { clearRefreshCookie } from "../../auth/cookies.js";
import { identifierSchema } from "@authenik8/contracts";
import { asyncHandler } from "../../utils/http.js";
import {
  changePassword,
  getProfile,
  listProviders,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  unlinkProvider,
  updateProfile,
} from "./user.service.js";

export const profileController = asyncHandler(async (req, res) => {
  res.json({ user: await getProfile(req.user!.userId) });
});

export const updateProfileController = asyncHandler(async (req, res) => {
  res.json({ user: await updateProfile(req.user!.userId, req.body) });
});

export const changePasswordController = asyncHandler(async (req, res) => {
  await changePassword(req.user!.userId, req.body);
  clearRefreshCookie(res);
  res.json({ message: "Password updated" });
});

export const sessionsController = asyncHandler(async (req, res) => {
  res.json({ sessions: await listSessions(req.user!.userId, req) });
});

export const revokeSessionController = asyncHandler(async (req, res) => {
  if (await revokeSession(req.user!.userId, identifierSchema.parse(req.params.id), req)) clearRefreshCookie(res);
  res.json({ message: "Session revoked" });
});

export const revokeOtherSessionsController = asyncHandler(async (req, res) => {
  const revoked = await revokeOtherSessions(req.user!.userId, req);
  res.json({ message: "Other sessions revoked", revoked });
});

export const providersController = asyncHandler(async (req, res) => {
  res.json({ providers: await listProviders(req.user!.userId) });
});

export const unlinkProviderController = asyncHandler(async (req, res) => {
  await unlinkProvider(req.user!.userId, req.params.provider);
  res.json({ message: "Provider unlinked" });
});
