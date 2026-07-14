import { Request, Response } from "express";
import {
  InputValidationError,
  parseIdentifier,
  sanitizeSessionResponse,
} from "../../utils/security";

function sessionError(res: Response, error: unknown, fallback: string) {
  if (error instanceof InputValidationError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: fallback });
}

export const protectedController = {
  protected( res: Response) {
    res.json({ message: "Protected route" });
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
      sessionError(res, error, "Failed to retrieve sessions");
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
      sessionError(res, error, "Failed to revoke session");
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
      sessionError(res, error, "Failed to revoke sessions");
    }
  },
};
