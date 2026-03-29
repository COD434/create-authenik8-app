import { Request, Response, NextFunction } from "express";
import { SignOptions } from "jsonwebtoken";
interface JwtPayload {
    userId: string;
    email: string;
    type?: string;
    id?: string;
    createdAt?: number;
}
export interface JWTOptions {
    jwtSecret: string;
    expiry?: SignOptions["expiresIn"];
    redisClient?: any;
    onGuestToken?: () => void;
}
export declare class JWTService {
    private jwtSecret;
    private expiry?;
    signToken(payload: object): string;
    private redisclient?;
    private onGuestToken?;
    constructor(options: JWTOptions);
    guestToken(): string;
    verifyToken(token: string): JwtPayload | null;
    authenticateJWT: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
}
export {};
//# sourceMappingURL=jwtAuth.d.ts.map