import express from "express";
import { createAuthenik8 } from "authenik8-core";
import { hashPassword, comparePassword } from "./utils/hash";
import {prisma} from "./prisma/client"

const app = express();
app.use(express.json());

async function start() {
  const auth = await createAuthenik8({
    jwtSecret: process.env.JWT_SECRET!,
    refreshSecret: process.env.REFRESH_SECRET!,
  });

  
  app.post("/register", async (req, res) => {
    const { email, password } = req.body;

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    res.json({ message: "User created", userId: user.id });
  });


  app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await comparePassword(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = auth.signToken({
      id: user.id,
      email: user.email,
    });

    const refreshToken = await auth.generateRefreshToken({
      id: user.id,
      email: user.email,
    });

    res.json({ accessToken, refreshToken });
  });

  
  app.post("/refresh", async (req, res) => {
    const tokens = await auth.refreshToken(req.body.refreshToken);
    res.json(tokens);
  });

  // ✅ PROTECTED
  app.get("/protected", auth.requireAdmin, (req, res) => {
    res.json({ message: "Protected route" });
  });

  app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
  });
}

start();
