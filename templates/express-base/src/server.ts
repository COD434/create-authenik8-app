import express from "express";
import { createAuthenik8 } from "authenik8-core";

const app = express();
app.use(express.json());

async function start() {
  const auth = await createAuthenik8({
    jwtSecret: process.env.JWT_SECRET!,
    refreshSecret: process.env.REFRESH_SECRET!,
  });

  app.use(auth.helmet);
  app.use(auth.rateLimit);

  
  app.get("/public", (req, res) => {
    res.json({ message: "Public route" });
  });

  
  app.get("/guest", async (req, res) => {
    const token = await auth.guestToken({ role: "guest" });
    res.json({ token });
  });



  app.get("/protected", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    try {
      const decoded = await auth.verifyToken(token);
      res.json({ message: "Protected data", user: decoded });
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  });

  
  app.post("/refresh", async (req, res) => {
    const tokens = await auth.refreshToken(req.body.refreshToken);
    res.json(tokens);
  });

  // 🛡️ Admin route
  app.get("/admin", auth.requireAdmin, (req, res) => {
    res.json({ message: "Admin only" });
  });

  app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
  });
}

start();
