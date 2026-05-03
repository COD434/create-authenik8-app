import express from "express";
import { createBaseRoutes } from "./routes/base.routes";

export const createApp = (auth: any) => {
  const app = express();

  app.use(express.json({ limit: "16kb", strict: true }));

  app.use(auth.helmet);
  app.use(auth.rateLimit);

  app.use("/", createBaseRoutes(auth));

  return app;
};
