import type { RequestHandler } from "express";
import { isAllowedOrigin } from "../config/origins.js";

export const requireAllowedOrigin: RequestHandler = (req, res, next) => {
  if (!isAllowedOrigin(req.get("origin"))) {
    return res.status(403).json({
      error: { code: "ORIGIN_REJECTED", message: "Request origin is not allowed" },
      requestId: req.id,
    });
  }
  next();
};
