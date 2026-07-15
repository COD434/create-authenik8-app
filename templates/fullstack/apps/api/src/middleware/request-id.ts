import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  req.id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
};
