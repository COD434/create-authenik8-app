// tests/testApp.ts
import express from "express";
import request from "supertest";
import { createAuthenik8 } from "../createAuthenik8";

export const createTestApp = async () => {
  const auth = await createAuthenik8({
    jwtSecret: "test-secret",
    refreshSecret: "refresh-secret",
    jwtExpiry: "15m"
  });

  const app = express();
  app.use(express.json());

  // 🔐 Login (simulate user)
  app.post("/login", async(req, res) => {
    const user = { userId: "user_1", email:"test@test.com" };

    const accessToken = auth.signToken(user);
    const refreshToken = await auth.generateRefreshToken(user);

    res.json({ accessToken, refreshToken });
    console.log("Refresh Token",refreshToken)
  });

  // 🔒 Protected route
  app.get("/protected", (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
   
    if(!token){
   return res.status(401).json({error:"Invalid token"})
    }
    
    const decoded = auth.verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    res.json({ data: "secure data", user: decoded });
  });

  // 🔄 Refresh
  app.post("/refresh", async (req, res) => {
    try {
      const result = await auth.refreshToken(req.body.refreshToken);
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: "Invalid refresh token" });
    }

  });

  return { app, auth, request: request(app) };
};
