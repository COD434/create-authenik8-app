import { Request, Response, NextFunction } from "express";
import { getAuth } from "../auth";

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  return getAuth().requireAdmin(req, res, next);
};

export const authMiddleware = (req: Request, res: Response, next: NextFunction) =>
  getAuth().requireAuth(req, res, next);
