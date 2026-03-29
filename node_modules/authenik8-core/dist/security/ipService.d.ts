import Redis from "ioredis";
import type { StringValue } from "ms";
import { RequestHandler } from "express";
import { Request, Response, NextFunction } from "express";
export interface SecurityOptions {
    redisClient?: Redis;
    jwtSecret?: string;
    jwtExpiry?: StringValue;
    rateLimitPoints?: number;
    rateLimitDuration?: number;
    rateLimitBlock?: number;
    rateLimiterEnabled?: boolean;
    enableWhitelist?: boolean;
    enableRateLimiter?: boolean;
    enableHelmet?: boolean;
    whiteListEnabled?: boolean;
    helmetEnabled?: boolean;
}
export declare class SecurityModule {
    private redisClient;
    private jwtSecret;
    private jwtExpiry;
    private rateLimiter?;
    private whiteListEnabled;
    private helmetEnabled;
    private rateLimiterEnabled;
    constructor(options?: SecurityOptions);
    isAllowed(ip: string): Promise<boolean>;
    addIP(ipOrCIDR: string, ttl?: number): Promise<void>;
    removeIP(ipOrCIDR: string): Promise<void>;
    listIPs(): Promise<string[]>;
    whiteListMiddleware(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    rateLimiterMiddleware(): (req: Request, res: Response, next: NextFunction) => void;
    helmetMiddleware(): RequestHandler;
}
//# sourceMappingURL=ipService.d.ts.map