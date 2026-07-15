import  express from "express";
import { createAuthRoutes } from "./routes/auth.routes";
import { createProtectedRoutes } from "./routes/protected.routes";

export const createApp = (auth: any) => {
  const app = express();

  app.use(express.json({ limit: "16kb", strict: true }));

  app.use(auth.helmet);
  app.use(auth.rateLimit);

  app.get("/.well-known/jwks.json", (_req, res) => res.json(auth.getJwks()));

  app.use("/auth", createAuthRoutes(auth));
  app.use("/", createProtectedRoutes(auth));

  return app;
};
