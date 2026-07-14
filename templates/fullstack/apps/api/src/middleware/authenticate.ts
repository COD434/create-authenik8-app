import type { RequestHandler } from "express";
import { prisma } from "../config/prisma.js";
import { getAuthenik8 } from "../auth/authenik8.js";

export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const payload = token ? getAuthenik8().verifyToken(token) : null;
  if (!payload?.userId) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" }, requestId: req.id });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.status !== "ACTIVE") {
    return res.status(401).json({ error: { code: "SESSION_INVALID", message: "This session is no longer active" }, requestId: req.id });
  }

  req.user = { userId: user.id, email: user.email, name: user.name, role: user.role };
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Administrator access required" }, requestId: req.id });
  }
  next();
};
