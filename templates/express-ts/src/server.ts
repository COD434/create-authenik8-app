import express from "express";
import { createAuthenik8 } from "authenik8-core";

const app = express();
app.use(express.json());

async function start() {
  const auth = await createAuthenik8({
    jwtSecret: process.env.JWT_SECRET!,
    refreshSecret: process.env.REFRESH_SECRET!,
  });

  app.post("/login", async (req, res) => {
    const user = { id: "123", email: "test@test.com" };

    const accessToken = auth.signToken(user);
    const refreshToken = await auth.generateRefreshToken(user);

    res.json({ accessToken, refreshToken });
  });

  app.post("/refresh", async (req, res) => {
    const tokens = await auth.refreshToken(req.body.refreshToken);
    res.json(tokens);
  });

  app.get("/protected", auth.requireAdmin, (req, res) => {
    res.json({ message: "Protected route" });
  });

  app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
  });
}

start();
