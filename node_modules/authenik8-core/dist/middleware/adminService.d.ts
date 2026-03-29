import { Request, Response, NextFunction } from "express";
import { RequireAdminOptions } from "../types/admin";
export declare const requireAdmin: (options: RequireAdminOptions) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=adminService.d.ts.map