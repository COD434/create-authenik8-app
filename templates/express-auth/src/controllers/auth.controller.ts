import { Request, Response } from "express";
import { AuthService } from "../services/auth.services";

export const createAuthController = (auth: any) => ({
  async register(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const user = await AuthService.register(email, password);

      res.json({ message: "User created", userId: user.id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const user = await AuthService.login(email, password);

      const accessToken = auth.signToken({
        userId: user.id,
        email: user.email,
      });

      const refreshToken = await auth.generateRefreshToken({
        userId: user.id,
        email: user.email,
      });

      res.json({ accessToken, refreshToken });
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  },

  async refresh(req: Request, res: Response) {
    const tokens = await auth.refreshToken(req.body.refreshToken);
    res.json(tokens);
  },
});
