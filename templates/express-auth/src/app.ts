import express from "express";
import { createAuthRoutes } from "./routes/auth.routes";
import { createProtectedRoutes } from "./routes/protected.routes";

export const createApp = (auth: any) => {
  const app = express();

  app.use(express.json());

  app.use("/auth", createAuthRoutes(auth));
  app.use("/", createProtectedRoutes(auth));

  return app;
};
