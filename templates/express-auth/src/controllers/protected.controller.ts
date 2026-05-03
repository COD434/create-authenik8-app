import { Request, Response } from "express";
import { sanitizeSessionResponse } from "../utils/security";

export const createProtectedController = () => ({
  protected(req: Request, res: Response) {
    res.json({ message: "Protected route" });
  },

  async listSessions(req: Request, res: Response) {
    try {
      const actions = (req as any).adminActions;
      if (!actions) {
        return res.status(503).json({ success: false, message: "Session management unavailable" });
      }

      const sessions = await actions.listSessions(req.params.userId);
      res.json({ sessions: sanitizeSessionResponse(sessions) });
    } catch {
      res.status(500).json({ success: false, message: "Failed to retrieve sessions" });
    }
  },

  async revokeSession(req: Request, res: Response) {
    try {
      const actions = (req as any).adminActions;
      if (!actions) {
        return res.status(503).json({ success: false, message: "Session management unavailable" });
      }

      await actions.revokeSession(req.params.userId, req.params.sessionId);
      res.json({ success: true, message: "Session revoked" });
    } catch {
      res.status(500).json({ success: false, message: "Failed to revoke session" });
    }
  },

  async revokeAllSessions(req: Request, res: Response) {
    try {
      const actions = (req as any).adminActions;
      if (!actions) {
        return res.status(503).json({ success: false, message: "Session management unavailable" });
      }

      await actions.revokeAllSessions(req.params.userId);
      res.json({ success: true, message: "All sessions revoked" });
    } catch {
      res.status(500).json({ success: false, message: "Failed to revoke sessions" });
    }
  },
});
