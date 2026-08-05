import { ApiError, createAuthenik8Client } from "@authenik8/api-client";

export { ApiError };

export const authenik8 = createAuthenik8Client({
  baseUrl: import.meta.env.VITE_AUTHENIK8_API_URL,
});

export const authApi = authenik8.auth;
export const accountApi = {
  getProfile: authenik8.account.getProfile,
  updateProfile: authenik8.account.updateProfile,
  changePassword: authenik8.account.changePassword,
  sessions: authenik8.sessions.list,
  revokeSession: authenik8.sessions.revoke,
  revokeOtherSessions: authenik8.sessions.revokeOthers,
  providers: authenik8.account.linkedProviders,
  unlinkProvider: authenik8.account.unlinkProvider,
  startProviderLink: authenik8.account.startProviderLink,
};
export const projectApi = authenik8.projects;
export const adminApi = {
  users: authenik8.admin.users.list,
  getUser: authenik8.admin.users.get,
  updateUser: authenik8.admin.users.update,
  updateUserStatus: authenik8.admin.users.updateStatus,
  updateUserRoles: authenik8.admin.users.updateRoles,
  revokeSessions: authenik8.admin.users.revokeSessions,
  audit: authenik8.admin.audit.list,
};
export const healthApi = authenik8.health;
export const onAuthenticationLost = authenik8.onAuthenticationLost;
