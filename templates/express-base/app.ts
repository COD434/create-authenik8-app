import express from "express";
import type { Authenik8Instance } from "authenik8-core";
import { createBaseRoutes } from "./routes/base.routes";

export const createApp = (auth: Authenik8Instance) => {
  const app = express();

  app.use(express.json({ limit: "16kb", strict: true }));

  app.use(auth.helmet);
  app.use(auth.rateLimit);

  app.get("/.well-known/jwks.json", (_req, res) => res.json(auth.getJwks()));

  app.use("/", createBaseRoutes(auth));

  return app;
};
