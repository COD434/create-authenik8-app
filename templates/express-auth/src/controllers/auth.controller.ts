import { Request, Response } from "express";
import type { Authenik8Instance } from "authenik8-core";
import { AuthService } from "../services/auth.services";
import {
  InputValidationError,
  parseCredentials,
  parseRefreshToken,
} from "../utils/security";

export const createAuthController = (auth: Authenik8Instance) => ({
  async register(req: Request, res: Response) {
    try {
      const { email, password } = parseCredentials(req.body);

      await AuthService.register(email, password);

      res.json({ message: "Registration request accepted" });
    } catch (err) {
      if (err instanceof InputValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: "Registration could not be completed" });
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
