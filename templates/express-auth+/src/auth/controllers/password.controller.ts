import { Request, Response } from "express";
import { getAuth } from "../auth";
import { prisma } from "../../prisma/client";
import { hashPassword, comparePassword } from "../../utils/hash";
import {
  InputValidationError,
  parseCredentials,
  parseRefreshToken,
} from "../../utils/security";

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && error.code === "P2002",
  );
}

export const passwordController = {
  async register(req: Request, res: Response) {
    try {
      const { email, password } = parseCredentials(req.body);
      const passwordHash = await hashPassword(password);
      try {
        await prisma.user.create({
          data: {
            email,
            password: passwordHash,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }

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
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user?.password || !(await comparePassword(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const auth = getAuth();
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
      const tokens = await getAuth().refreshToken(refreshToken);

      res.json(tokens);
    } catch {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  },
};
