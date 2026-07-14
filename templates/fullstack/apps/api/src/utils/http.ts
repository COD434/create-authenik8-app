import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => void handler(req, res, next).catch(next);
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: { code: "VALIDATION_ERROR", message: "Check the submitted fields", fields: error.flatten().fieldErrors },
      requestId: req.id,
    });
  }
  if (error instanceof AppError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message }, requestId: req.id });
  }
  req.log?.error({ err: error }, "Unhandled request error");
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "The request could not be completed" },
    requestId: req.id,
  });
}

export function notFound(req: Request, res: Response) {
  return res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId: req.id });
}
