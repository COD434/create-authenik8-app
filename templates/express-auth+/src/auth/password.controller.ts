import { Request, Response } from "express";
import { getAuth } from "./auth";
import { prisma } from "../prisma/client";
import { hashPassword, comparePassword } from "../utils/hash";
import { parseCredentials } from "../utils/security";

export const passwordController = {
  async register(req: Request, res: Response) {
    try {
      const { email, password } = parseCredentials(req.body);

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "Email is already registered" });
      }

      const user = await prisma.user.create({
        data: {
          email,
          password: await hashPassword(password),
        },
      });

      res.json({ message: "User created", userId: user.id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || "Invalid registration request" });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = parseCredentials(req.body);
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !(await comparePassword(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const auth = getAuth();
      const accessToken = auth.signToken({
        userId: user.id,
        email: user.email,
      });

      const refreshToken = await auth.generateRefreshToken({
        userId: user.id,
        email: user.email,
      });

      res.json({ accessToken, refreshToken });
    } catch {
      res.status(401).json({ error: "Invalid credentials" });
    }
  },
};
