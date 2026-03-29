import { SignOptions } from "jsonwebtoken";
export declare class MissingTokenError extends Error {
    constructor(message?: string);
}
export declare class InvalidTokenError extends Error {
    constructor(message?: string);
}
interface TokenPayload {
    userId: string;
    email: string;
}
export interface TokenStore {
    get(key: string): Promise<string | null>;
    set?(key: string, value: string, expiry?: number): Promise<void>;
    del?(key: string): Promise<void>;
    getset?(key: string, value: string, expiry?: number): Promise<string | null>;
}
export interface RefreshServiceOptions {
    tokenStore: TokenStore;
    accessTokenSecret: string;
    redisClient: any;
    refreshTokenSecret: string;
    accessTokenExpiry: SignOptions["expiresIn"];
    rotateRefreshTokens?: boolean;
    refreshTokenExpiry?: string | number;
}
export interface RefreshResult {
    accessToken: string;
    refreshToken?: string;
}
export declare class RefreshService {
    private tokenStore;
    private accessTokenSecret;
    private refreshTokenSecret;
    private accessTokenExpiry;
    private rotateRefreshTokens;
    private refreshTokenExpiry;
    private lock;
    constructor(options: RefreshServiceOptions);
    generateRefreshToken(payload: TokenPayload): Promise<string>;
    refresh(refreshToken?: string): Promise<RefreshResult>;
}
export {};
//# sourceMappingURL=refreshService.d.ts.map