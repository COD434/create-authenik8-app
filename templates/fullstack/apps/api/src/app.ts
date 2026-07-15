import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { getAuthenik8, redis } from "./auth/authenik8.js";
import { authRoutes } from "./auth/auth.routes.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { isAllowedOrigin } from "./config/origins.js";
import { prisma } from "./config/prisma.js";
import { requestId } from "./middleware/request-id.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import { projectRoutes } from "./modules/projects/project.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { AppError, asyncHandler, errorHandler, notFound } from "./utils/http.js";
import { openApiDocument } from "./openapi.js";

export function createApp() {
  const app = express();
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id }));
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      callback(new AppError(403, "ORIGIN_REJECTED", "Request origin is not allowed"));
    },
  }));
  app.use(getAuthenik8().helmet);
  // authenik8-core provides the Redis-backed limiter for every route below.
  app.use(getAuthenik8().rateLimit);
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(cookieParser());

  app.get("/api/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/docs/openapi.json", (_req, res) => res.json(openApiDocument));
  app.get("/api/health/ready", asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    const pong = await redis.ping();
    res.json({ status: "ready", database: "ok", redis: pong === "PONG" ? "ok" : "unavailable" });
  }));

  app.use("/api/auth", authRoutes);
  app.use("/api/account", userRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/admin", adminRoutes);

  if (env.NODE_ENV === "production") {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const webDist = path.resolve(currentDir, "../../web/dist");
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));

    // codeql[js/missing-rate-limiting] authenik8-core rate-limits this handler globally.
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html")) return res.sendFile(path.join(webDist, "index.html"));
      next();
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
