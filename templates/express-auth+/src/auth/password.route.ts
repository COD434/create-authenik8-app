import { auth } from "./auth";
import { prisma } from "../prisma/client";
import { hashPassword, comparePassword } from "../utils/hash";
import express from "express";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.create({
    data: {
      email,
      password: await hashPassword(password),
    },
  });

  res.json({ message: "User created", userId: user.id });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await comparePassword(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = auth.signToken({
    userId: user.id,
    email: user.email,
  });

  const refreshToken = await auth.generateRefreshToken({
    userId: user.id,
    email: user.email,
  });

  res.json({ accessToken, refreshToken });
});

export default router;
