import { Request, Response, NextFunction } from "express";
export declare const initializeRateLimiter: () => Promise<void>;
export declare const OTPLimiterMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const LoginLimiterMiddleware: () => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=limiter.d.ts.map