import { clearRefreshCookie } from "../../auth/cookies.js";
import { identifierSchema } from "@authenik8/contracts";
import { asyncHandler } from "../../utils/http.js";
import { changePassword, listProviders, listSessions, revokeSession, updateProfile } from "./user.service.js";

export const updateProfileController = asyncHandler(async (req, res) => {
  res.json({ user: await updateProfile(req.user!.userId, req.body) });
});

export const changePasswordController = asyncHandler(async (req, res) => {
  await changePassword(req.user!.userId, req.body);
  res.json({ message: "Password updated" });
});

export const sessionsController = asyncHandler(async (req, res) => {
  res.json({ sessions: await listSessions(req.user!.userId, req) });
});

export const revokeSessionController = asyncHandler(async (req, res) => {
  if (await revokeSession(req.user!.userId, identifierSchema.parse(req.params.id), req)) clearRefreshCookie(res);
  res.json({ message: "Session revoked" });
});

export const providersController = asyncHandler(async (req, res) => {
  res.json({ providers: await listProviders(req.user!.userId) });
});
