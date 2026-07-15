import { Request, Response } from "express";
import {
  InputValidationError,
  parseIdentifier,
  parseRefreshToken,
  sanitizeSessionResponse,
} from "../utils/security";

export const createBaseController = (auth: any) => ({
  publicRoute(req: Request, res: Response) {
    res.json({ message: "Public route" });
  },

  async guest(req: Request, res: Response) {
    const token = await auth.guestToken({ role: "guest" });
    res.json({ token });
  },

  protected(req: Request, res: Response) {
    res.json({ message: "Protected data", user: (req as any).user });
  },

  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = parseRefreshToken(req.body);
      const tokens = await auth.refreshToken(refreshToken);
      res.json(tokens);
    } catch {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  },

  admin(req: Request, res: Response) {
    res.json({ message: "Admin only" });
  },

  async listSessions(req: Request, res: Response) {
    try {
      const actions = (req as any).adminActions;
      if (!actions) {
        return res.status(503).json({ success: false, message: "Session management unavailable" });
      }

      const userId = parseIdentifier(req.params.userId, "User ID");
      const sessions = await actions.listSessions(userId);
      res.json({ sessions: sanitizeSessionResponse(sessions) });
    } catch (error) {
      const validationError = error instanceof InputValidationError;
      res.status(validationError ? 400 : 500).json({
        success: false,
        message: validationError ? error.message : "Failed to retrieve sessions",
      });
    }
  },

  async revokeSession(req: Request, res: Response) {
    try {
      const actions = (req as any).adminActions;
      if (!actions) {
        return res.status(503).json({ success: false, message: "Session management unavailable" });
      }

      const userId = parseIdentifier(req.params.userId, "User ID");
      const sessionId = parseIdentifier(req.params.sessionId, "Session ID");
      await actions.revokeSession(userId, sessionId);
      res.json({ success: true, message: "Session revoked" });
    } catch (error) {
      const validationError = error instanceof InputValidationError;
      res.status(validationError ? 400 : 500).json({
        success: false,
        message: validationError ? error.message : "Failed to revoke session",
      });
    }
  },

  async revokeAllSessions(req: Request, res: Response) {
    try {
      const actions = (req as any).adminActions;
      if (!actions) {
        return res.status(503).json({ success: false, message: "Session management unavailable" });
      }

      const userId = parseIdentifier(req.params.userId, "User ID");
      await actions.revokeAllSessions(userId);
      res.json({ success: true, message: "All sessions revoked" });
    } catch (error) {
      const validationError = error instanceof InputValidationError;
      res.status(validationError ? 400 : 500).json({
        success: false,
        message: validationError ? error.message : "Failed to revoke sessions",
      });
    }
  },
});
