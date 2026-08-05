import type { RequestHandler, Response } from "express";
import { prisma } from "../config/prisma.js";
import { getAuthenik8 } from "../auth/authenik8.js";

function normalizedAuthResponse(res: Response, requestId: unknown): Response {
  const response = Object.create(res) as Response;
  let authenticationFailed = false;

  response.status = (statusCode: number) => {
    authenticationFailed = statusCode === 401 || statusCode === 403;
    res.status(authenticationFailed ? 401 : statusCode);
    return response;
  };
  response.json = (body: unknown) => authenticationFailed
    ? res.json({
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        requestId: String(requestId),
      })
    : res.json(body);

  return response;
}

export const authenticate: RequestHandler = (req, res, next) =>
  getAuthenik8().requireAuth(req, normalizedAuthResponse(res, req.id), async () => {
    const payload = req.user;
    if (!payload?.userId) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
        requestId: req.id,
      });
    }

    if (!payload.sessionId) {
      return res.status(401).json({
        error: { code: "SESSION_INVALID", message: "This session is no longer active" },
        requestId: req.id,
      });
    }

    const session = await prisma.session.findFirst({
      where: {
        userId: payload.userId,
        coreSessionId: payload.sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!session || session.user.status !== "ACTIVE") {
      return res.status(401).json({
        error: { code: "SESSION_INVALID", message: "This session is no longer active" },
        requestId: req.id,
      });
    }

    const { user } = session;
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
