import type { RequestHandler } from "express";
import { prisma } from "../config/prisma.js";
import { getAuthenik8 } from "../auth/authenik8.js";

export const authenticate: RequestHandler = (req, res, next) =>
  getAuthenik8().requireAuth(req, res, async () => {
    const payload = req.user;
    if (!payload?.userId) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        requestId: req.id,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        error: { code: "SESSION_INVALID", message: "This session is no longer active" },
        requestId: req.id,
      });
    }

    req.user = { userId: user.id, email: user.email, name: user.name, role: user.role };
    next();
  });

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Administrator access required" },
      requestId: req.id,
    });
  }
  next();
};
