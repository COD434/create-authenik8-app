import { asyncHandler } from "../../utils/http.js";
import { identifierSchema, pageSchema } from "@authenik8/contracts";
import { listAuditEvents, listUsers, revokeAllSessions, updateUser } from "./admin.service.js";

export const listUsersController = asyncHandler(async (req, res) => {
  res.json(await listUsers(pageSchema.parse(req.query.page)));
});
export const updateUserController = asyncHandler(async (req, res) => {
  res.json({ user: await updateUser(req.user!.userId, identifierSchema.parse(req.params.id), req.body, req.ip ?? "unknown") });
});
export const revokeUserSessionsController = asyncHandler(async (req, res) => {
  await revokeAllSessions(req.user!.userId, identifierSchema.parse(req.params.id), req.ip ?? "unknown");
  res.json({ message: "Sessions revoked" });
});
export const auditController = asyncHandler(async (_req, res) => {
  res.json({ events: await listAuditEvents() });
});
