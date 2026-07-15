import { Request, Response } from "express";
import { AuthService } from "../services/auth.services";
import { parseCredentials, parseRefreshToken } from "../utils/security";

export const createAuthController = (auth: any) => ({
  async register(req: Request, res: Response) {
    try {
      const { email, password } = parseCredentials(req.body);

      const user = await AuthService.register(email, password);

      res.json({ message: "User created", userId: user.id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || "Invalid registration request" });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = parseCredentials(req.body);

      const user = await AuthService.login(email, password);

      const { accessToken, refreshToken } = await auth.issueTokens({
        userId: user.id,
        email: user.email,
        role: String(user.role).toLowerCase(),
      });

      res.json({ accessToken, refreshToken });
    } catch {
      res.status(401).json({ error: "Invalid credentials" });
    }
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
});
