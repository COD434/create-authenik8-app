import type { Authenik8Instance } from "authenik8-core";

export const createAuthMiddleware = (auth: Authenik8Instance) => auth.requireAuth;
