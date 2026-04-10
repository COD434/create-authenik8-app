import { Request, Response } from "express";

export const createBaseController = (auth: any) => ({
  publicRoute(req: Request, res: Response) {
    res.json({ message: "Public route" });
  },

  async guest(req: Request, res: Response) {
    const token = await auth.guestToken({ role: "guest" });
    res.json({ token });
  },

  async protected(req: Request, res: Response) {
    const token = req.headers.authorization?.split(" ")[1];

    try {
      const decoded = await auth.verifyToken(token);
      res.json({ message: "Protected data", user: decoded });
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  },

  async refresh(req: Request, res: Response) {
    const tokens = await auth.refreshToken(req.body.refreshToken);
    res.json(tokens);
  },

  admin(req: Request, res: Response) {
    res.json({ message: "Admin only" });
  },
});
